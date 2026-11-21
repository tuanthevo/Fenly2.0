/**
 * Applicant inbox for the host and housemates: applicant cards, the AI summary,
 * shortlist / decline / choose / ID-check request (host only), housemate votes
 * and housemate invites.
 *
 * Fair housing: fit, sorting and the AI summary only see FactualApplicant
 * (src/find/factualApplicant.ts). Names, photos, bios and notes are shown to the
 * host as written, never scored or sent to the AI.
 */
import type { Express, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ThinkingLevel } from "@google/genai";
import { currentUser, requireUser, type AuthedUser } from "./auth.js";
import { getFlags } from "./flags.js";
import { ai, GEMINI_FLASH_LITE_MODEL } from "./gemini.js";
import { track } from "./track.js";
import { notify } from "./notify.js";
import { publicOrigin } from "./fillRoutes.js";
import { adminDb, clip, dbError, isUuid, signedUrls, userDb } from "./routeKit.js";
import { hashInviteToken, inviteProblem, inviteUrl, isInviteToken, newInviteToken, INVITE_TTL_MS } from "./invites.js";
import { toFactualApplicant } from "../src/find/factualApplicant.js";
import { compareApplicants, scoreApplicant, summarizeApplicants, type ScoredApplicant, type Fit } from "../src/find/fit.js";
import { APPLICANT_SUMMARY_INSTRUCTION, APPLICANT_SUMMARY_SCHEMA, buildApplicantSummaryPrompt } from "../src/find/hostText.js";
import { similarRooms } from "../src/find/similarRooms.js";
import { cleanLifestyle, type Lifestyle } from "../src/find/lifestyle.js";
import { fairHousingIssues } from "../src/remotion/viral/copy.js";
import { formatRentCents } from "../src/fill/publicListing.js";
import { shareUrl } from "../src/fill/linkCodes.js";
import { channelLabel } from "../src/fill/attribution.js";
import type { ShareChannel } from "../src/fill/types.js";

type Row = Record<string, any>;

export type ApplicantCard = {
  applicationId: string;
  applicantId: string;
  status: string;
  declineReason: string | null;
  createdAt: string;
  firstName: string | null;
  photoUrl: string | null;
  bio: string | null;
  note: string | null;
  introUrl: string | null;
  moveInDate: string | null;
  channel: string;
  lifestyle: Lifestyle;
  badges: { phone: boolean; id: boolean; idProvider: string | null; rentHistory: boolean; level: number };
  budget: { minCents: number | null; maxCents: number | null };
  moveInWindow: { from: string | null; to: string | null };
  stayLength: string | null;
  fit: { moveIn: Fit; budget: Fit; strong: boolean };
  votes: { up: number; down: number; mine: number };
  idCheckRequestedAt: string | null;
};

type HouseContext = { listing: Row; role: "host" | "housemate" };

/** The listing if the user is its host or a housemate; sends 404 otherwise. */
async function houseContext(admin: SupabaseClient, res: Response, listingId: string, user: AuthedUser): Promise<HouseContext | null> {
  if (!isUuid(listingId)) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const { data: listing } = await admin
    .from("listings")
    .select("id, owner_id, status, title, neighborhood, city, rent_cents, available_from, move_out_date")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  if (listing.owner_id === user.id) return { listing, role: "host" };
  const { data: member } = await admin.from("house_members").select("user_id").eq("listing_id", listingId).eq("user_id", user.id).maybeSingle();
  if (member) return { listing, role: "housemate" };
  res.status(404).json({ error: "not_found" });
  return null;
}

/** Applicant cards for a listing, sorted (chosen, shortlisted, strong fits, Passport level, oldest). */
async function loadApplicants(admin: SupabaseClient, db: SupabaseClient, listing: Row, viewerId: string): Promise<{ cards: ApplicantCard[]; scored: ScoredApplicant[] }> {
  const { data: apps, error } = await db
    .from("applications")
    .select("id, applicant_id, status, note, intro_video_path, move_in_date, created_at, source_link_id, decline_reason, id_check_requested_at")
    .eq("listing_id", listing.id);
  if (error) throw new Error(error.message);
  const rows = (apps ?? []) as Row[];
  if (rows.length === 0) return { cards: [], scored: [] };
  const applicantIds = rows.map((a) => a.applicant_id);
  const [users, passports, votes, links, verifications] = await Promise.all([
    admin.from("users").select("id, first_name, photo_url, bio").in("id", applicantIds),
    admin.from("passports").select("user_id, level, move_in_from, move_in_to, stay_length, budget_min_cents, budget_max_cents, lifestyle, phone_verified, id_verified, rent_history_verified").in("user_id", applicantIds),
    db.from("applicant_votes").select("application_id, voter_id, vote").in("application_id", rows.map((a) => a.id)),
    admin.from("listing_links").select("id, channel").eq("listing_id", listing.id),
    admin.from("verifications").select("user_id, provider, status, verified_at").in("user_id", applicantIds).eq("kind", "government_id").eq("status", "verified"),
  ]);
  const user = (id: string) => (users.data ?? []).find((u) => u.id === id);
  const pass = (id: string) => (passports.data ?? []).find((p) => p.user_id === id);
  const photoPaths = (users.data ?? []).map((u) => u.photo_url).filter((p: string | null) => p && !/^https?:/.test(p));
  const [photos, intros] = await Promise.all([
    signedUrls(admin, "profile-photos", photoPaths),
    signedUrls(admin, "applicant-intros", rows.map((a) => a.intro_video_path)),
  ]);
  const scored: ScoredApplicant[] = [];
  const cards: ApplicantCard[] = rows.map((a) => {
    const u = user(a.applicant_id);
    const p: Row = pass(a.applicant_id) ?? {};
    const facts = toFactualApplicant({
      phoneVerified: p.phone_verified,
      idVerified: p.id_verified,
      rentHistoryVerified: p.rent_history_verified,
      passportLevel: p.level,
      moveInDate: a.move_in_date,
      moveInFrom: p.move_in_from,
      moveInTo: p.move_in_to,
      stayLength: p.stay_length,
      budgetMinCents: p.budget_min_cents,
      budgetMaxCents: p.budget_max_cents,
      lifestyle: p.lifestyle,
      hasIntroVideo: Boolean(a.intro_video_path),
      noteLength: typeof a.note === "string" ? a.note.length : 0,
    });
    const s = scoreApplicant({ id: a.id, status: a.status, createdAt: a.created_at, facts }, { rentCents: listing.rent_cents, availableFrom: listing.available_from });
    scored.push(s);
    const appVotes = (votes.data ?? []).filter((v) => v.application_id === a.id);
    const link = (links.data ?? []).find((l) => l.id === a.source_link_id);
    const idRow = (verifications.data ?? []).filter((v) => v.user_id === a.applicant_id).sort((x, y) => String(y.verified_at).localeCompare(String(x.verified_at)))[0];
    return {
      applicationId: a.id,
      applicantId: a.applicant_id,
      status: a.status,
      declineReason: a.decline_reason ?? null,
      createdAt: a.created_at,
      firstName: u?.first_name ?? null,
      photoUrl: u?.photo_url ? (/^https?:/.test(u.photo_url) ? u.photo_url : photos.get(u.photo_url) ?? null) : null,
      bio: u?.bio ?? null,
      note: a.note ?? null,
      introUrl: a.intro_video_path ? intros.get(a.intro_video_path) ?? null : null,
      moveInDate: a.move_in_date ?? null,
      channel: channelLabel((link?.channel as ShareChannel) ?? "direct"),
      lifestyle: cleanLifestyle(p.lifestyle),
      badges: { phone: facts.phoneVerified, id: facts.idVerified, idProvider: facts.idVerified ? idRow?.provider ?? null : null, rentHistory: facts.rentHistoryVerified, level: facts.passportLevel },
      budget: { minCents: facts.budgetMinCents, maxCents: facts.budgetMaxCents },
      moveInWindow: { from: facts.moveInFrom, to: facts.moveInTo },
      stayLength: facts.stayLength,
      fit: { moveIn: s.moveIn, budget: s.budget, strong: s.strong },
      votes: {
        up: appVotes.filter((v) => v.vote > 0).length,
        down: appVotes.filter((v) => v.vote < 0).length,
        mine: appVotes.find((v) => v.voter_id === viewerId)?.vote ?? 0,
      },
      idCheckRequestedAt: a.id_check_requested_at ?? null,
    };
  });
  const order = new Map([...scored].sort(compareApplicants).map((s, i) => [s.id, i]));
  cards.sort((x, y) => (order.get(x.applicationId) ?? 0) - (order.get(y.applicationId) ?? 0));
  return { cards, scored };
}

const areaOf = (listing: Row) => listing.neighborhood || listing.city || "your area";

/** Similar published rooms for "This room is taken", with their direct links. */
async function similarFor(admin: SupabaseClient, listing: Row, origin: string) {
  const { data } = await admin
    .from("listings")
    .select("id, city, neighborhood, rent_cents, available_from, published_at")
    .eq("status", "published")
    .is("hidden_at", null)
    .neq("id", listing.id)
    .limit(200);
  const picks = similarRooms(
    { id: listing.id, city: listing.city, neighborhood: listing.neighborhood, rentCents: listing.rent_cents, availableFrom: listing.available_from },
    (data ?? []).map((r) => ({ id: r.id, city: r.city, neighborhood: r.neighborhood, rentCents: r.rent_cents, availableFrom: r.available_from, publishedAt: r.published_at }))
  );
  if (picks.length === 0) return [];
  const { data: links } = await admin.from("listing_links").select("listing_id, code").in("listing_id", picks.map((p) => p.id)).eq("channel", "direct");
  return picks.map((p) => {
    const code = (links ?? []).find((l) => l.listing_id === p.id)?.code;
    return {
      listingId: p.id,
      area: p.neighborhood ?? p.city ?? "the Bay Area",
      rent: formatRentCents(p.rentCents) ?? "",
      url: code ? shareUrl(origin, code) : `${origin}/?room=${p.id}`,
    };
  });
}

export function registerHostRoutes(app: Express): void {
  // Listings the user hosts or is a housemate on, with applicant counts (Fill tab).
  app.get("/api/hosting", requireUser(), async (_req, res) => {
    const user = currentUser(res)!;
    const admin = adminDb(res);
    if (!admin) return;
    const { data: memberships } = await admin.from("house_members").select("listing_id").eq("user_id", user.id);
    const memberIds = (memberships ?? []).map((m) => m.listing_id);
    const { data: listings, error } = await admin
      .from("listings")
      .select("id, owner_id, status, title, neighborhood, rent_cents, move_out_date, published_at")
      .or([`owner_id.eq.${user.id}`, ...(memberIds.length ? [`id.in.(${memberIds.join(",")})`] : [])].join(","))
      .in("status", ["published", "filled"]);
    if (error) return dbError(res, error, "hosting");
    const ids = (listings ?? []).map((l) => l.id);
    const { data: apps } = ids.length ? await admin.from("applications").select("listing_id, status").in("listing_id", ids) : { data: [] as Row[] };
    res.json({
      listings: (listings ?? []).map((l) => {
        const mine = (apps ?? []).filter((a) => a.listing_id === l.id);
        return {
          id: l.id,
          title: l.title,
          neighborhood: l.neighborhood,
          status: l.status,
          rentCents: l.rent_cents,
          moveOutDate: l.move_out_date,
          role: l.owner_id === user.id ? "host" : "housemate",
          applicants: mine.length,
          open: mine.filter((a) => a.status === "submitted" || a.status === "shortlisted").length,
        };
      }),
    });
  });

  app.get("/api/listings/:id/applicants", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const admin = adminDb(res);
    const db = userDb(res);
    if (!admin || !db) return;
    const ctx = await houseContext(admin, res, req.params.id, user);
    if (!ctx) return;
    try {
      const { cards, scored } = await loadApplicants(admin, db, ctx.listing, user.id);
      res.json({
        listing: {
          id: ctx.listing.id,
          title: ctx.listing.title,
          neighborhood: ctx.listing.neighborhood,
          status: ctx.listing.status,
          rentCents: ctx.listing.rent_cents,
          availableFrom: ctx.listing.available_from,
        },
        role: ctx.role,
        applicants: cards,
        summary: summarizeApplicants(scored),
        idCheckEnabled: getFlags().id_check,
      });
    } catch (e) {
      console.error("applicants:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "database_error" });
    }
  });

  // AI summary from factual fields only; the rule-based summary is the fallback.
  app.post("/api/listings/:id/applicants/summary", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const admin = adminDb(res);
    const db = userDb(res);
    if (!admin || !db) return;
    const ctx = await houseContext(admin, res, req.params.id, user);
    if (!ctx) return;
    let scored: ScoredApplicant[];
    try {
      scored = (await loadApplicants(admin, db, ctx.listing, user.id)).scored;
    } catch (e) {
      return res.status(500).json({ error: "database_error" });
    }
    const open = scored.filter((s) => s.status === "submitted" || s.status === "shortlisted").sort(compareApplicants);
    const fallback = { headline: summarizeApplicants(scored), applicants: {} as Record<string, { fit: string; reason: string }>, source: "rules" };
    if (open.length === 0 || !process.env.GEMINI_API_KEY) return res.json(fallback);
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_FLASH_LITE_MODEL,
        contents: buildApplicantSummaryPrompt(
          { rentCents: ctx.listing.rent_cents, availableFrom: ctx.listing.available_from },
          open.slice(0, 30).map((s, i) => ({ number: i + 1, facts: s.facts }))
        ),
        config: {
          systemInstruction: APPLICANT_SUMMARY_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: "application/json",
          responseJsonSchema: APPLICANT_SUMMARY_SCHEMA,
        },
      });
      const parsed = JSON.parse((response.text || "{}").trim());
      const headline = String(parsed.headline ?? "").slice(0, 140);
      // The AI writes about numbered applicants' facts only; a fair-housing hit falls back to the rules.
      if (!headline || fairHousingIssues(headline).length) return res.json(fallback);
      const perApplicant: Record<string, { fit: string; reason: string }> = {};
      for (const item of Array.isArray(parsed.applicants) ? parsed.applicants : []) {
        const s = open[Number(item?.number) - 1];
        const reason = String(item?.reason ?? "").slice(0, 120);
        if (s && ["strong", "possible", "weak"].includes(item?.fit) && !fairHousingIssues(reason).length) perApplicant[s.id] = { fit: item.fit, reason };
      }
      res.json({ headline, applicants: perApplicant, source: "ai" });
    } catch (e) {
      console.error("applicant summary:", e instanceof Error ? e.message : e);
      res.json(fallback);
    }
  });

  // Host actions on one application.
  app.post("/api/applications/:id/:action(shortlist|decline|choose|request-id)", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const action = req.params.action;
    const admin = adminDb(res);
    const db = userDb(res);
    if (!admin || !db) return;
    if (!isUuid(req.params.id)) return res.status(404).json({ error: "not_found" });
    const { data: application } = await admin.from("applications").select("id, listing_id, applicant_id, status").eq("id", req.params.id).maybeSingle();
    if (!application) return res.status(404).json({ error: "not_found" });
    const ctx = await houseContext(admin, res, application.listing_id, user);
    if (!ctx) return;
    if (ctx.role !== "host") return res.status(403).json({ error: "host_only", message: "Only the host can do that. You can vote with a thumbs up or down." });
    const listing = ctx.listing;
    const origin = publicOrigin(req);
    const area = areaOf(listing);
    const { data: applicantProfile } = await admin.from("users").select("first_name").eq("id", application.applicant_id).maybeSingle();
    const firstName = applicantProfile?.first_name ?? null;
    const open = application.status === "submitted" || application.status === "shortlisted";

    if (action === "shortlist") {
      if (application.status !== "submitted") return res.status(409).json({ error: "wrong_status" });
      const { error } = await db.from("applications").update({ status: "shortlisted" }).eq("id", application.id);
      if (error) return dbError(res, error, "shortlist");
      await track("shortlisted", {}, { userId: user.id, listingId: listing.id });
      return res.json({ status: "shortlisted" });
    }

    if (action === "request-id") {
      if (!getFlags().id_check) return res.status(404).json({ error: "not_found" });
      if (application.status !== "shortlisted") return res.status(409).json({ error: "shortlist_first", message: "Shortlist this applicant first." });
      const { error } = await db.from("applications").update({ id_check_requested_at: new Date().toISOString() }).eq("id", application.id);
      if (error) return dbError(res, error, "request id");
      await notify({ userId: application.applicant_id, kind: "id_check_requested", listingId: listing.id, payload: { area, firstName, path: "/?passport=verify" }, appUrl: origin, dedupeKey: `id_request:${application.id}` });
      return res.json({ idCheckRequestedAt: new Date().toISOString() });
    }

    if (action === "decline") {
      if (!open) return res.status(409).json({ error: "wrong_status" });
      const message = clip(req.body?.message, 1000);
      if (message) {
        const issues = fairHousingIssues(message);
        if (issues.length) return res.status(422).json({ error: "fair_housing", issues: [{ field: "message", phrases: issues }] });
      }
      const { error } = await db.from("applications").update({ status: "declined", decline_reason: "host" }).eq("id", application.id);
      if (error) return dbError(res, error, "decline");
      if (message) {
        await db.from("messages").insert({ application_id: application.id, sender_id: user.id, recipient_id: application.applicant_id, body: message });
      }
      await notify({ userId: application.applicant_id, kind: "declined", listingId: listing.id, payload: { area, firstName, message, path: "/" }, appUrl: origin });
      return res.json({ status: "declined" });
    }

    // choose: the room is filled; everyone else still open gets "This room is taken" + similar rooms.
    if (!open) return res.status(409).json({ error: "wrong_status" });
    if (listing.status !== "published") return res.status(409).json({ error: "not_published", message: "This room is already filled." });
    const now = new Date().toISOString();
    const chosen = await db.from("applications").update({ status: "chosen" }).eq("id", application.id);
    if (chosen.error) return dbError(res, chosen.error, "choose");
    const filled = await db.from("listings").update({ status: "filled", filled_at: now }).eq("id", listing.id);
    if (filled.error) return dbError(res, filled.error, "fill listing");
    const { data: others } = await admin
      .from("applications")
      .select("id, applicant_id")
      .eq("listing_id", listing.id)
      .in("status", ["submitted", "shortlisted"]);
    if (others?.length) {
      await db.from("applications").update({ status: "declined", decline_reason: "room_filled" }).in("id", others.map((o) => o.id));
    }
    await track("chosen", {}, { userId: user.id, listingId: listing.id });
    await track("room_filled", { applicants: (others?.length ?? 0) + 1 }, { userId: user.id, listingId: listing.id });
    await notify({ userId: application.applicant_id, kind: "chosen", listingId: listing.id, payload: { area, firstName, path: `/?inbox=${application.id}` }, appUrl: origin });
    if (others?.length) {
      const similar = await similarFor(admin, listing, origin);
      const { data: names } = await admin.from("users").select("id, first_name").in("id", others.map((o) => o.applicant_id));
      await Promise.all(
        others.map((o) =>
          notify({
            userId: o.applicant_id,
            kind: "room_taken",
            listingId: listing.id,
            payload: { area, firstName: (names ?? []).find((n) => n.id === o.applicant_id)?.first_name ?? null, similar, path: "/?inbox=taken" },
            appUrl: origin,
            dedupeKey: `room_taken:${o.id}`,
          })
        )
      );
    }
    res.json({ status: "chosen", listingStatus: "filled", othersNotified: others?.length ?? 0 });
  });

  // Housemates (and the host) vote; 0 removes the vote.
  app.post("/api/applications/:id/vote", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const vote = Number(req.body?.vote);
    if (![1, -1, 0].includes(vote)) return res.status(400).json({ error: "invalid" });
    if (!isUuid(req.params.id)) return res.status(404).json({ error: "not_found" });
    const db = userDb(res);
    if (!db) return;
    const result =
      vote === 0
        ? await db.from("applicant_votes").delete().eq("application_id", req.params.id).eq("voter_id", user.id)
        : await db.from("applicant_votes").upsert({ application_id: req.params.id, voter_id: user.id, vote }, { onConflict: "application_id,voter_id" });
    if (result.error) return dbError(res, result.error, "vote");
    res.json({ vote });
  });

  // Housemate invite link (host only). The token is shown once; only its hash is stored.
  app.post("/api/listings/:id/invites", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const db = userDb(res);
    if (!db) return;
    if (!isUuid(req.params.id)) return res.status(404).json({ error: "not_found" });
    const token = newInviteToken();
    const { error } = await db.from("house_invites").insert({
      listing_id: req.params.id,
      created_by: user.id,
      token_hash: hashInviteToken(token),
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    });
    if (error) return error.code === "42501" ? res.status(404).json({ error: "not_found" }) : dbError(res, error, "invite");
    res.status(201).json({ url: inviteUrl(publicOrigin(req), token), expiresInDays: 7 });
  });

  app.post("/api/invites/redeem", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const admin = adminDb(res);
    if (!admin) return;
    const token = req.body?.token;
    if (!isInviteToken(token)) return res.status(404).json({ error: "not_found" });
    const { data: invite } = await admin.from("house_invites").select("id, listing_id, expires_at, used_by").eq("token_hash", hashInviteToken(token)).maybeSingle();
    const { data: listing } = invite ? await admin.from("listings").select("id, owner_id, title, neighborhood").eq("id", invite.listing_id).maybeSingle() : { data: null };
    if (invite && listing && (invite.used_by === user.id || listing.owner_id === user.id)) {
      return res.json({ listingId: listing.id, alreadyMember: true });
    }
    const problem = inviteProblem(invite, Date.now());
    if (problem || !listing) {
      const message = problem === "used" ? "This invite was already used. Ask the host for a new one." : problem === "expired" ? "This invite has expired. Ask the host for a new one." : "This invite link isn't valid.";
      return res.status(410).json({ error: problem ?? "not_found", message });
    }
    const claimed = await admin.from("house_invites").update({ used_by: user.id, used_at: new Date().toISOString() }).eq("id", invite!.id).is("used_by", null).select("id");
    if (claimed.error || !claimed.data?.length) return res.status(410).json({ error: "used", message: "This invite was already used. Ask the host for a new one." });
    const { error } = await admin.from("house_members").upsert({ listing_id: listing.id, user_id: user.id, role: "housemate" }, { onConflict: "listing_id,user_id" });
    if (error) return dbError(res, error, "join house");
    await track("housemate_joined", {}, { userId: user.id, listingId: listing.id });
    res.json({ listingId: listing.id, title: listing.title, neighborhood: listing.neighborhood });
  });
}
