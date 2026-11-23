/**
 * Admin metrics (FENLY_ADMIN_EMAILS): the Part 6 funnel for the last 7 or 28
 * days, the north star (rooms filled in the launch area) and virality.
 * Each step shows the plan's "If low, try" so a broken step points to a fix.
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Loader2 } from 'lucide-react';
import { findApi, type FunnelReport } from '../../lib/findApi';
import type { MediaSplitRow } from '../../../server/metrics';

const pct = (rate: number | null) => (rate == null ? '–' : `${Math.round(rate * 100)}%`);

export const MetricsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [days, setDays] = useState<7 | 28>(7);
  const [report, setReport] = useState<FunnelReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setReport(null);
    setError(null);
    findApi
      .metrics(days)
      .then((r) => alive && setReport(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load metrics."));
    return () => {
      alive = false;
    };
  }, [days]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#F9F7F3] text-[#2C2724] p-3.5 space-y-3" data-testid="metrics-view">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-xl bg-white border border-[#2C2724] flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="flex-1 font-extrabold text-base flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-[#A9513A]" aria-hidden="true" /> Funnel
        </h1>
        <div role="group" aria-label="Time window" className="flex rounded-xl border border-[#2C2724]/25 bg-white overflow-hidden">
          {([7, 28] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`min-w-11 min-h-10 px-3 text-xs font-extrabold ${days === d ? 'bg-[#2C2724] text-[#F9F7F3]' : ''}`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs font-bold text-[#9A4A33]">{error}</p>}
      {!report && !error ? (
        <div className="flex justify-center py-10 text-[#6E655F]" role="status" aria-label="Loading">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm">
              <div className="text-[11px] font-bold text-[#6E655F]">North star: rooms filled in the launch area</div>
              <div className="text-2xl font-black mt-1">{report.northStar.filledLaunchArea}</div>
              <div className="text-[11px] font-bold text-[#485B4A]">{report.northStar.perWeek} per week</div>
            </div>
            <div className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm">
              <div className="text-[11px] font-bold text-[#6E655F]">Applications through a shared link</div>
              <div className="text-2xl font-black mt-1">{pct(report.virality.rate)}</div>
              <div className="text-[11px] font-bold text-[#6E655F]">
                {report.virality.viaLink} of {report.virality.applications}
              </div>
            </div>
          </div>

          <ol className="space-y-2" aria-label={`Funnel, last ${report.days} days`}>
            {report.rows.map((row, i) => (
              <li key={row.id} className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-black text-[#6E655F] w-4 shrink-0">{i + 1}</span>
                  <h2 className="flex-1 text-xs font-extrabold">{row.step}</h2>
                  <span className="text-base font-black tabular-nums">{pct(row.rate)}</span>
                </div>
                {row.rate != null && (
                  <div className="h-2 rounded-full bg-[#F2EFE9] overflow-hidden ml-6" aria-hidden="true">
                    <div className="h-full rounded-full bg-[#7A907C]" style={{ width: `${Math.round(row.rate * 100)}%` }} />
                  </div>
                )}
                <p className="text-[11px] text-[#6E655F] ml-6">
                  <span className="font-bold text-[#2C2724]">{row.metric}:</span> {row.value ?? 'not measured yet'}
                  {row.note ? ` · ${row.note}` : ''}
                </p>
                <p className="text-[11px] ml-6">
                  <span className="font-bold">If low, try:</span> {row.ifLow}
                </p>
              </li>
            ))}
          </ol>
          {report.mediaSplit && (
            <section className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2" data-testid="metrics-media-split">
              <div>
                <h2 className="text-xs font-extrabold">Video vs photos</h2>
                <p className="text-[11px] text-[#6E655F]">Listings started in the last {report.days} days. Photos should add listings without costing applicants.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="text-left text-[11px] text-[#6E655F]">
                      <th scope="col" className="font-bold py-1 pr-2">Measure</th>
                      <th scope="col" className="font-bold py-1 px-2 text-right">Video</th>
                      <th scope="col" className="font-bold py-1 pl-2 text-right">Photos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['Option chosen', (r) => String(r.chosen)],
                        ['Started', (r) => String(r.started)],
                        ['Published', (r) => String(r.published)],
                        ['Completion rate', (r) => pct(r.completionRate)],
                        ['Time to publish (median)', (r) => (r.medianHoursToPublish == null ? '–' : r.medianHoursToPublish < 1 ? `${Math.round(r.medianHoursToPublish * 60)} min` : `${Math.round(r.medianHoursToPublish * 10) / 10} h`)],
                        ['Applicants per listing', (r) => (r.applicantsPerListing == null ? '–' : String(Math.round(r.applicantsPerListing * 10) / 10))],
                        ['Days to fill (median)', (r) => (r.medianDaysToFill == null ? '–' : `${Math.round(r.medianDaysToFill * 10) / 10} (${r.filled} filled)`)],
                      ] as [string, (r: MediaSplitRow) => string][]
                    ).map(([label, value]) => (
                      <tr key={label} className="border-t border-[#2C2724]/10">
                        <th scope="row" className="font-bold text-left py-1.5 pr-2">{label}</th>
                        {report.mediaSplit!.map((r) => (
                          <td key={r.mediaType} className="py-1.5 pl-2 text-right font-extrabold">{value(r)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <p className="text-[10px] text-[#6E655F]">Counts come from tracked events and the listings and applications tables. No personal data is shown.</p>
        </>
      ) : null}
    </div>
  );
};
