import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maskAndScanMessage,
  evaluateLayer2OffPlatformAttempt,
  calculateStripeConnectSplit,
  calculateMoveInGuarantee,
  generateCaliforniaRoomLease,
  LANDLORD_INCLUDED_BENEFITS,
  REDACTION_PLACEHOLDER,
  parseWrenChatToFeedQuery,
  getWrenCoWatcherCallouts,
  shouldTriggerWrenInstantPivot,
  ASK_FENN_SYSTEM_INSTRUCTION,
  parseAskFennSearch,
  evaluateListingWithFenn,
  getRoomBedBathTag,
  SAMPLE_PGE_UTILITY_BILL,
  calculateUtilityBillSplit,
  INITIAL_CREDIT_BOOST_LOGS,
  formatFennEscrowStatus,
  createInitialAskFennHistory,
  startNewAskFennChatAndSaveHistory,
  PRE_FLIGHT_CHECKLIST_BANNER_TEXT,
  SLOW_COUNTDOWN_STEP_MS,
  SLOW_RECORDING_DURATION_MS,
  createInitialViralTourSlots,
  toggleViralSlotSwap,
  detectEntranceFromSideColumns,
  evaluateCameraAlignmentGate,
  getRecordingPacerCue,
  buildStructuredViralTourPlan,
  parseRoomAvailableDateToIso,
  isRoomAvailableOnOrBeforeMoveIn,
  buildPrepopulatedRoommateLeaseOptions,
  generateAiListingTitleAndDescription,
} from './trustSafety';

test('AI Listing Copy Auto-Fill: generateAiListingTitleAndDescription synthesizes title and description from location and loaded pictures', () => {
  const aiCopy = generateAiListingTitleAndDescription({
    neighborhood: 'Mission District',
    city: 'San Francisco',
    roomType: 'Private Room',
    beds: 1,
    baths: 1,
    monthlyRent: 1450,
    squareFeet: 220,
    leaseTerm: '6 Months',
    amenities: ['Private Bath', 'In-Unit W/D', 'High-Speed WiFi'],
    loadedPictures: [
      {
        id: 'pic-1',
        label: 'Sunny Window Corner',
        url: 'https://example.com/pic1.jpg',
        visualCue: 'Sunlit corner bedroom with hardwood floors',
      },
      {
        id: 'pic-2',
        label: 'Chef Kitchen Wide',
        url: 'https://example.com/pic2.jpg',
        visualCue: 'Modern kitchen island with quartz countertops',
      },
    ],
  });

  assert.ok(aiCopy.title.includes('Mission District'));
  assert.ok(aiCopy.description.includes('Mission District, San Francisco'));
  assert.ok(aiCopy.description.includes('2 loaded listing photos'));
  assert.ok(aiCopy.analyzedPicturesSummary.includes('2 loaded pictures'));
});

test('Layer 1: maskAndScanMessage replaces 10-digit phone numbers with [Hidden until booking is confirmed]', () => {
  const res = maskAndScanMessage('Text me at 408-555-1234');
  assert.equal(res.sanitizedText, `Text me at ${REDACTION_PLACEHOLDER}`);
  assert.equal(res.wasRedacted, true);
  assert.equal(res.redactedTypes.includes('phone'), true);
  assert.equal(res.circumventionDetected, true);
});

test('Layer 1: maskAndScanMessage replaces @ emails and .com links with [Hidden until booking is confirmed]', () => {
  const res = maskAndScanMessage(
    'Email me at landlord@example.com or check mylistings.com/room1'
  );
  assert.equal(
    res.sanitizedText,
    `Email me at ${REDACTION_PLACEHOLDER} or check ${REDACTION_PLACEHOLDER}`
  );
  assert.equal(res.wasRedacted, true);
  assert.deepEqual(res.redactedTypes, ['email', 'link']);
  assert.equal(res.circumventionDetected, true);
});

test('Layer 1: maskAndScanMessage unmasks contact info once booking is confirmed', () => {
  const clearedRes = maskAndScanMessage('Text me at 408-555-1234', true);
  assert.equal(clearedRes.sanitizedText, 'Text me at 408-555-1234');
  assert.equal(clearedRes.wasRedacted, false);
  assert.equal(clearedRes.circumventionDetected, false);
});

test('Layer 2: evaluateLayer2OffPlatformAttempt catches spelled-out phone numbers and sneaky IG handles', () => {
  const spelledPhone = evaluateLayer2OffPlatformAttempt(
    'call me at four zero eight, five five five, one two three four'
  );
  assert.equal(spelledPhone.is_off_platform_attempt, true);
  assert.ok(spelledPhone.confidence >= 0.95);

  const sneakyIg = evaluateLayer2OffPlatformAttempt(
    'find me on IG under john_doe_realty'
  );
  assert.equal(sneakyIg.is_off_platform_attempt, true);
  assert.ok(sneakyIg.confidence >= 0.95);

  const cleanInquiry = evaluateLayer2OffPlatformAttempt(
    'Hi! Is parking included and when can I tour the room?'
  );
  assert.equal(cleanInquiry.is_off_platform_attempt, false);
});

test('Pillar 2: calculateStripeConnectSplit computes 90% landlord / 10% Aspiring Venture LLC and Sage Green Fenn Rentals badge', () => {
  const split = calculateStripeConnectSplit(1200, '2026-11-01T14:00:00Z');
  assert.equal(split.totalHeldAmount, 1200);
  assert.equal(split.landlordTransferAmount, 1080);
  assert.equal(split.platformFeeAmount, 120);
  assert.equal(split.platformEntityName, 'Aspiring Venture LLC');
  assert.equal(split.badgeText, '[ ✓ $1,200 Held Safely by Fenn Rentals ]');
  assert.equal(split.moveInWindowHours, 24);
});

test('Pillar 2: calculateMoveInGuarantee computes total escrow protected amount', () => {
  const summary = calculateMoveInGuarantee(1450, 1000);
  assert.equal(summary.totalEscrowProtected, 2450);
  assert.ok(summary.releaseRule.includes('Fenn Rentals'));
});

test('Pillar 3: generateCaliforniaRoomLease injects dynamic template variables and house rules', () => {
  const leaseText = generateCaliforniaRoomLease({
    landlord_name: 'Sarah Chen',
    tenant_name: 'Alex Rivera',
    monthly_rent: 1200,
    quiet_hours: '10:00 PM – 8:00 AM Weekdays',
    guest_policy: 'No overnight guests more than 2 nights a week',
  });
  assert.ok(leaseText.includes('Sarah Chen'));
  assert.ok(leaseText.includes('Alex Rivera'));
  assert.ok(leaseText.includes('$1,200/month'));
  assert.ok(leaseText.includes('10:00 PM – 8:00 AM Weekdays'));
  assert.ok(leaseText.includes('No overnight guests more than 2 nights a week'));
  assert.ok(leaseText.includes('Dropbox Sign'));
});

test('Pillar 3: LANDLORD_INCLUDED_BENEFITS covers Stripe Identity, FCRA/CA 1950.6, Hybrid Lease, and Stripe Connect', () => {
  assert.equal(LANDLORD_INCLUDED_BENEFITS.length, 4);
  assert.equal(LANDLORD_INCLUDED_BENEFITS[0].id, 'stripe_identity');
  assert.equal(LANDLORD_INCLUDED_BENEFITS[1].id, 'fcra_screening');
  assert.equal(LANDLORD_INCLUDED_BENEFITS[2].id, 'hybrid_california_lease');
  assert.equal(LANDLORD_INCLUDED_BENEFITS[3].id, 'stripe_connect_escrow');
});

test('Wren Flow 1: parseWrenChatToFeedQuery extracts budget, pet, and no-carpet traits with Wren persona reply', () => {
  const handoff = parseWrenChatToFeedQuery(
    'Need a 1-bed under $2,800, dog-friendly, hate carpet'
  );
  assert.equal(handoff.extractedMaxPrice, 2800);
  assert.equal(handoff.petFriendlyDetected, true);
  assert.equal(handoff.noCarpetDetected, true);
  assert.ok(handoff.wrenReply.includes('Got it. No carpet, room for the pup'));
});

test('Wren Flow 2: getWrenCoWatcherCallouts & shouldTriggerWrenInstantPivot return Context Callout, Red-Flag Radar, and Instant Pivot', () => {
  const callouts = getWrenCoWatcherCallouts({
    id: 'room-1',
    title: 'Sun-Drenched Mission Loft Room',
    location: 'Mission District, SF',
    amenities: ['Utilities Included', 'In-Unit Laundry'],
  });
  assert.equal(callouts.length, 3);
  assert.equal(callouts[0].type, 'context_callout');
  assert.ok(callouts[0].text.includes('gas stove, and utilities are included'));
  assert.equal(callouts[1].type, 'red_flag_radar');
  assert.ok(callouts[1].text.includes('street parking'));

  const pivotNo = shouldTriggerWrenInstantPivot(2);
  assert.equal(pivotNo.triggered, false);

  const pivotYes = shouldTriggerWrenInstantPivot(3);
  assert.equal(pivotYes.triggered, true);
  assert.ok(pivotYes.promptText.includes('Not feeling the industrial loft vibe?'));
});

test('Ask Fenn: parseAskFennSearch translates casual query into structured search filters and perks ears', () => {
  const mockRooms = [
    {
      id: 'room-1',
      title: 'Sun-drenched Mission Loft Room',
      price: 1450,
      neighborhood: 'Mission District',
      location: 'Mission District, San Francisco, CA',
      amenities: ['Private Bath', 'In-Unit W/D', 'Utilities Included'],
    },
    {
      id: 'room-2',
      title: 'Williamsburg Skyline Studio',
      price: 1650,
      neighborhood: 'Williamsburg',
      location: 'Williamsburg, Brooklyn, NY',
      amenities: ['In-Unit W/D', 'Balcony'],
    },
  ];

  const result = parseAskFennSearch(
    'I need a bright 1BR near good coffee under $2,800 with in-unit laundry',
    mockRooms
  );

  assert.equal(result.structuredFilters.maxPrice, 2800);
  assert.equal(result.structuredFilters.bedBathLabel, '1BR • 1BA');
  assert.equal(result.structuredFilters.naturalLight, true);
  assert.equal(result.structuredFilters.nearCoffee, true);
  assert.ok(result.structuredFilters.amenities.includes('In-Unit W/D'));
  assert.equal(result.earsPerked, true);
  assert.ok(result.matchedRoomIds.includes('room-1'));
  assert.ok(result.fennReply.includes('Den'));
  assert.ok(!result.fennReply.toLowerCase().includes('pawsome'));
});

test('Ask Fenn: ASK_FENN_SYSTEM_INSTRUCTION and evaluateListingWithFenn enforce Fenn persona and red-flag detection', () => {
  assert.ok(ASK_FENN_SYSTEM_INSTRUCTION.includes('big ears on the street'));
  assert.ok(ASK_FENN_SYSTEM_INSTRUCTION.includes('Never use cheesy fox puns'));
  const audit = evaluateListingWithFenn({
    id: 'room-2',
    title: 'Williamsburg Skyline Studio',
    price: 1650,
    amenities: ['In-Unit W/D', 'Balcony'],
  });
  assert.ok(audit.pros.length >= 2);
  assert.ok(audit.redFlag.includes('4th-floor walk-up'));
  assert.equal(getRoomBedBathTag({ id: 'room-1', roomType: 'Master Suite', amenities: ['Private Bath'] }), '1BR Suite • 1BA');
});

test('House OS: calculateUtilityBillSplit divides PG&E bill across 3 roommates and computes combined Stripe Rent Pull', () => {
  const split = calculateUtilityBillSplit(SAMPLE_PGE_UTILITY_BILL);
  assert.equal(split.bill.utility_provider, 'Pacific Gas & Electric (PG&E)');
  assert.equal(split.bill.address_match_verified, true);
  assert.equal(split.roommateCount, 3);
  assert.equal(split.perRoommateShare, 76.2);
  assert.equal(split.splits[0].combinedStripePull, 1526.2);
  assert.equal(
    formatFennEscrowStatus(1200),
    '$1,200 Held Safely by Fenn — Releases to Host 24h after Move-In'
  );
  assert.ok(INITIAL_CREDIT_BOOST_LOGS.length >= 5);
  assert.equal(INITIAL_CREDIT_BOOST_LOGS[0].bureaus, 'Equifax & TransUnion');
});

test('Ask Fenn History: startNewAskFennChatAndSaveHistory creates a fresh chat while preserving historical chats with user messages', () => {
  const sampleRooms = [
    {
      id: 'room-1',
      title: 'Mission Loft Suite',
      price: 1450,
      neighborhood: 'Mission District',
      amenities: ['In-Unit W/D', 'Private Bath'],
    },
  ];
  const initialSessions = createInitialAskFennHistory(sampleRooms);
  assert.equal(initialSessions.length, 3);
  // First session is fresh (only Fenn welcome message)
  assert.equal(initialSessions[0].messages.length, 1);
  assert.equal(initialSessions[0].messages[0].sender, 'fenn');

  // Simulate user sending a message in the active session
  const updatedFirst = {
    ...initialSessions[0],
    title: 'Sunny Mission Room',
    messages: [
      ...initialSessions[0].messages,
      { id: 'u-1', sender: 'user' as const, text: 'Sunny room in Mission', timestamp: 'Now' },
    ],
  };
  const afterSend = [updatedFirst, ...initialSessions.slice(1)];

  // Clicking Ask Fenn again starts a new fresh chat and preserves all 3 chats with user messages
  const next = startNewAskFennChatAndSaveHistory(afterSend, sampleRooms, 'fenn-new-99', 'Just now');
  assert.equal(next.activeSessionId, 'fenn-new-99');
  assert.equal(next.sessions.length, 4);
  assert.equal(next.sessions[0].id, 'fenn-new-99');
  assert.equal(next.sessions[0].messages.length, 1);
  assert.equal(next.sessions[1].title, 'Sunny Mission Room');
});

test('Guided Viral Home Tour Studio: createInitialViralTourSlots and toggleViralSlotSwap handle 5 slots and swaps on Video 3 & 5', () => {
  assert.equal(
    PRE_FLIGHT_CHECKLIST_BANNER_TEXT,
    'Turn on all lights, open blinds, and close toilet lids.'
  );
  const slots = createInitialViralTourSlots();
  assert.equal(slots.length, 5);
  assert.equal(slots[0].movementBadge, '3-Step Walk-In');
  assert.equal(slots[1].movementBadge, '3-Step Corner Push-In');
  assert.equal(slots[2].movementBadge, 'Zero-Walk Countertop Slide (Left to Right)');
  assert.equal(slots[3].movementBadge, '3-Step Walk Toward Windows');
  assert.equal(slots[4].movementBadge, 'Plant Feet & Lean Arms Through Doorframe');
  assert.equal(slots[2].supportsSwap, true);
  assert.equal(slots[4].supportsSwap, true);
  assert.equal(slots[0].supportsSwap, false);

  const swapped3 = toggleViralSlotSwap(slots, 3);
  assert.equal(swapped3[2].isSwapped, true);
  assert.equal(swapped3[2].alternateTitle, 'Video 3: Living Room Pullback');

  const swapped5 = toggleViralSlotSwap(swapped3, 5);
  assert.equal(swapped5[4].isSwapped, true);
  assert.equal(swapped5[4].alternateTitle, 'Video 5: Amenity Highlight');
});

test('Guided Viral Home Tour Studio: detectEntranceFromSideColumns and evaluateCameraAlignmentGate turn green from 1 column on each side or 90-deg angle', () => {
  const tilted = evaluateCameraAlignmentGate(72, 6, false, false);
  assert.equal(tilted.isAligned, false);
  assert.equal(tilted.boxColor, 'yellow');

  const aligned = evaluateCameraAlignmentGate(90, 1.5, false, false);
  assert.equal(aligned.isAligned, true);
  assert.equal(aligned.boxColor, 'green');

  const desktopLock = evaluateCameraAlignmentGate(45, 20, true, false);
  assert.equal(desktopLock.isAligned, true);
  assert.equal(desktopLock.boxColor, 'green');

  const entranceCols = detectEntranceFromSideColumns({
    leftColumnScore: 84,
    centerOpeningScore: 76,
    rightColumnScore: 88,
  });
  assert.equal(entranceCols.leftColumnDetected, true);
  assert.equal(entranceCols.rightColumnDetected, true);
  assert.equal(entranceCols.entranceIdentified, true);

  const entranceLock = evaluateCameraAlignmentGate(
    74,
    6,
    false,
    entranceCols.entranceIdentified
  );
  assert.equal(entranceLock.isAligned, true);
  assert.equal(entranceLock.boxColor, 'green');
  assert.ok(entranceLock.coachingText.includes('1 Column on Each Side'));
});

test('Guided Viral Home Tour Studio: slowed-down countdown & 7.5s getRecordingPacerCue and buildStructuredViralTourPlan return structured Gemini outputs', () => {
  assert.equal(SLOW_COUNTDOWN_STEP_MS, 1500);
  assert.equal(SLOW_RECORDING_DURATION_MS, 7500);
  assert.equal(getRecordingPacerCue('walking', 400).label, 'Hold...');
  assert.equal(getRecordingPacerCue('walking', 1800).label, 'Step 1...');
  assert.equal(getRecordingPacerCue('walking', 3800).label, 'Step 2...');
  assert.equal(getRecordingPacerCue('walking', 5800).label, 'Step 3...');
  assert.equal(getRecordingPacerCue('walking', 7100).label, 'Hold!');
  assert.ok(
    getRecordingPacerCue('counter_glide', 1000).label.includes(
      'Rest phone on counter & slide right slowly: 1... 2... 3'
    )
  );
  assert.ok(
    getRecordingPacerCue('doorway_reveal', 1000).label.includes(
      'Keep feet planted — slowly lean arms through doorway: 1... 2... 3'
    )
  );

  const plan = buildStructuredViralTourPlan({
    monthlyRent: 1450,
    beds: 1,
    baths: 1,
    neighborhood: 'Mission District',
    city: 'San Francisco',
    amenities: ['Private Bath', 'In-Unit W/D'],
  });
  assert.equal(plan.clips.length, 5);
  assert.equal(plan.clips[0].trim_start, 0.5);
  assert.equal(plan.clips[0].trim_end, 3.5);
  assert.equal(plan.clips[0].playback_speed, 0.75);
  assert.equal(plan.hook_overlay.line1_yellow, '$1,450/mo • 1 Bed 1 Bath');
  assert.equal(plan.hook_overlay.line2_white, 'Mission District, San Francisco');
  assert.equal(plan.cta_overlay, "Tap 'Book Tour' to see it in person");
  assert.ok(plan.voiceover_script.includes('Mission District rental is $1,450 a month'));
});

test('Move-In Date Availability Filter: parseRoomAvailableDateToIso and isRoomAvailableOnOrBeforeMoveIn filter listings to currently available or available at/prior to move-in date', () => {
  const refToday = '2026-10-28';
  assert.equal(parseRoomAvailableDateToIso('Immediately', refToday), '2026-10-28');
  assert.equal(parseRoomAvailableDateToIso('Nov 1, 2026', refToday), '2026-11-01');
  assert.equal(parseRoomAvailableDateToIso('Nov 15, 2026', refToday), '2026-11-15');
  assert.equal(parseRoomAvailableDateToIso('Dec 1, 2026', refToday), '2026-12-01');

  // Target Move-In Date: Nov 1, 2026 -> Immediately and Nov 1 pass; Nov 15 and Dec 1 are excluded
  assert.equal(isRoomAvailableOnOrBeforeMoveIn('Immediately', '2026-11-01', refToday), true);
  assert.equal(isRoomAvailableOnOrBeforeMoveIn('Nov 1, 2026', '2026-11-01', refToday), true);
  assert.equal(isRoomAvailableOnOrBeforeMoveIn('Nov 15, 2026', '2026-11-01', refToday), false);
  assert.equal(isRoomAvailableOnOrBeforeMoveIn('Dec 1, 2026', '2026-11-01', refToday), false);

  // Target Move-In Date: Nov 15, 2026 -> Immediately, Nov 1, and Nov 15 pass; Dec 1 is excluded
  assert.equal(isRoomAvailableOnOrBeforeMoveIn('Nov 15, 2026', '2026-11-15', refToday), true);
  assert.equal(isRoomAvailableOnOrBeforeMoveIn('Dec 1, 2026', '2026-11-15', refToday), false);

  // Target Move-In Date: Available Now (Oct 28, 2026) -> Only Immediately passes
  assert.equal(isRoomAvailableOnOrBeforeMoveIn('Immediately', '2026-10-28', refToday), true);
  assert.equal(isRoomAvailableOnOrBeforeMoveIn('Nov 1, 2026', '2026-10-28', refToday), false);
});

test('Interactive Roommate Lease Generator: buildPrepopulatedRoommateLeaseOptions prepopulates renter dropdown options from Landlord / Master Tenant lease', () => {
  const prepopulated = buildPrepopulatedRoommateLeaseOptions(
    {
      title: 'Sun-Drenched Mission Loft Room',
      location: 'Mission District, San Francisco, CA',
      price: 1450,
      leaseTerm: '12+ Months',
      availableDate: 'Nov 1, 2026',
      houseRules: ['Quiet hours after 10 PM on weeknights', 'No smoking inside'],
      amenities: ['Private Bath', 'Utilities Included'],
      host: { name: 'Sarah Miller' },
    },
    {
      landlordName: 'Sarah Miller',
      tenantName: 'Alex Rivera',
      earliestMoveInDate: '2026-11-01',
      leaseTerm: '12+ Months',
      ruleQuietHoursWeekdays: true,
      ruleMax2OvernightGuests: true,
      ruleNoSmokingIndoors: true,
    }
  );

  assert.equal(prepopulated.defaultMoveInDate, '2026-11-01');
  assert.equal(prepopulated.defaultLeaseTerm, '12+ Months');
  assert.ok(prepopulated.moveInDateOptions.length >= 4);
  assert.ok(prepopulated.leaseTermOptions.length >= 4);
  assert.ok(prepopulated.quietHoursOptions.length >= 3);
  assert.ok(prepopulated.guestPolicyOptions.length >= 3);
  assert.ok(prepopulated.utilitiesSplitOptions.length >= 3);
  assert.ok(prepopulated.smokingAndPetsOptions.length >= 3);
  assert.ok(prepopulated.defaultQuietHours.includes('10 PM'));
  assert.ok(prepopulated.defaultUtilitiesSplit.includes('100% Utilities'));
});



