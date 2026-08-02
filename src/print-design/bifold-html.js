const { buildEffectsCss } = require('./effects-template')
const { loadFontFaceCss } = require('./fonts')
const { escapeHtml, escapeAttr } = require('./html-escape')

const WORDMARK = 'SNACKET&reg;'
const WM_TAG = 'Where Brands Show Up'

function brandRow(logoUrl, variant = 'full') {
  if (variant === 'full') {
    return `
      <div class="brand-row">
        <div class="badge"><img src="${escapeAttr(logoUrl)}"></div>
        <div class="wordmark-col"><div class="wordmark">${WORDMARK}</div><div class="wm-tag">${WM_TAG}</div></div>
      </div>`
  }
  return `
      <div class="brand-row brand-row--compact">
        <div class="wordmark">${WORDMARK}</div>
      </div>`
}

function sharedHead(palette) {
  return `
<meta charset="utf-8">
<style>${loadFontFaceCss()}</style>
<style>${buildEffectsCss(palette)}</style>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Barlow', sans-serif; }
  .sheet { position: relative; width: 11.11in; height: 8.63in; overflow: hidden; background: var(--charcoal); }
  .panel { position: absolute; top: 0.065in; width: 5.49in; height: 8.5in; overflow: hidden; }
  .photo { position: absolute; inset: 0; background-size: cover; z-index: 0; }
  .tint { position: absolute; inset: 0; z-index: 0; }
  .content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; padding: 0.22in; }
  .brand-row { display: flex; align-items: center; gap: 12px; }
  .badge { width: 52px; height: 52px; border-radius: 50%; overflow: hidden; flex: 0 0 auto; background: #fff;
    box-shadow: 0 0 0 2.5px rgba(230,213,181,0.9); padding: 3.5px; }
  .badge img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .wordmark-col { display: flex; flex-direction: column; gap: 2px; }
  .wordmark { font-family: 'Barlow', sans-serif; color: #fff; font-weight: 700; font-size: 21px; letter-spacing: 1.5px; line-height: 1; }
  .wm-tag { color: rgba(230,213,181,0.85); font-weight: 400; font-size: 10px; letter-spacing: 0.8px; line-height: 1; }
  .big-word { font-family: 'Barlow Condensed', sans-serif; color: #fff; font-weight: 900; letter-spacing: -1px;
    text-shadow: 0 8px 28px rgba(0,0,0,0.55); line-height: 0.85; margin-top: auto; }
  .tagline .lead { color: var(--gold); font-weight: 700; }
  .tagline .desc { color: #fff; font-weight: 400; line-height: 1.35; margin-top: 4px; }
  /* Shared copy-heavy building blocks (v4 content refresh) — used across the
     back cover and both interior panels, all of which now carry long-form
     paragraphs + dense multi-item lists instead of the short poster-style
     copy the template originally shipped with. */
  .section-title { font-size: 11px; letter-spacing: 1.5px; font-weight: 700; color: var(--green); text-transform: uppercase; }
  /* Client feedback: brand beige for the body copy (was plain white) and a
     tighter line-height (was 1.42, loose) so paragraph blocks read as
     compact columns instead of loose stacked lines. */
  .body-copy p { font-size: 10.5px; line-height: 1.22; color: rgba(230,213,181,0.92); margin: 0 0 6px 0; text-shadow: 0 1px 4px rgba(0,0,0,0.4); width: 94%; }
  .body-copy p:last-child { margin-bottom: 0; }
  /* Dense 2-column tag list for long enumerations (12-item "DEPLOYED FOR",
     10-item "IDEAL FOR") that would blow the vertical budget as a normal
     bulleted list — deliberately compact, not the same visual weight as the
     .glass card lists used for shorter emphasis lists. */
  .tag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px; }
  .tag-item { font-size: 9.5px; line-height: 1.15; color: rgba(230,213,181,0.9); padding-left: 10px; position: relative; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .tag-item::before { content: '\\2022'; position: absolute; left: 0; color: var(--green); }
</style>`
}

// content.backCover.footerText may contain a literal newline for the 2-line
// footer ("SNACKET FOODS LLC\nCharlotte, NC · snacketnow.com") — render as <br>.
function footerHtml(footerText) {
  return escapeHtml(footerText).replace(/\n/g, '<br>')
}

// content.*.bigWord may contain a literal newline for a 2-line poster statement
// (e.g. "YOUR BRAND.\nDEPLOYED.") — same convention as footerText, render as <br>.
function bigWordHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

// Cover-panel-only variant: alternates the SNACKET gold/green accent colors
// per line instead of the shared plain-white bigWordHtml() used elsewhere.
function coverBigWordHtml(text) {
  const colors = ['gold', 'green']
  return escapeHtml(text).split('\n').map((line, i) => `<span class="bw-${colors[i % colors.length]}">${line}</span>`).join('<br>')
}

function buildFrontHtml({ content, palette, photoUrls }) {
  const { backCover, cover } = content
  const eyebrowHtml = cover.eyebrow ? `<div class="eyebrow">${escapeHtml(cover.eyebrow)}</div>` : ''
  const leadHtml = cover.taglineLead ? `<div class="lead">${escapeHtml(cover.taglineLead)}</div>` : ''
  return `<!doctype html>
<html>
<head>
${sharedHead(palette)}
<style>
  .panel-back { left: 0.065in; }
  .panel-cover { left: 5.555in; }
  /* This photo is landscape inside a portrait panel, so background-size: contain
     fits it to the panel's full width and letterboxes top/bottom. Client feedback:
     push the photo UP so there's only a small fixed ~1cm gap at the top instead of
     a big evenly-split gap, with the leftover space landing at the bottom.
     background-position: center 1cm is a LENGTH (not a percentage), so per spec it
     offsets the image's top edge exactly 1cm down from the panel's top edge
     regardless of the photo's aspect ratio — the top gap is therefore always
     exactly 1cm (~4.6% of this panel's 8.5in height) for any admin-uploaded photo.
     mask-image is a percentage-of-THIS-ELEMENT'S-OWN-BOX fade (the element is
     inset:0 = the full panel), not a percentage of the photo's rendered size.
     Fade math: outside the photo's rendered box there are no image pixels at all
     (background-repeat: no-repeat), so the mask can only visibly affect anything
     WITHIN the photo's real raster edges — for the seam to actually dissolve
     (not just partially dim before an unmasked hard cutoff), mask opacity must
     reach exactly 0% right at the photo's true edge, continuous with the fully
     transparent letterbox beyond it. First pass used a symmetric-looking
     "transparent 0%, black 9%" band (mask ~51% at the real 4.6% top edge) —
     verified via renderHtmlStringToPng + raw pixel sampling that this still left
     a measurable single-row luminance jump (~20-49pt depending on photo) right at
     the true edge on all 3 panels, i.e. a softened but still-real seam, not a
     dissolve. Fixed by anchoring the ramp's zero point exactly at the real edge
     instead: top ramp holds transparent through the fixed 4.6% edge, then climbs
     to fully opaque by 14% (9.4pt ramp, deeper INTO the photo, away from the
     edge). Bottom ramp mirrors this from the other direction and is photo-
     specific (re-tuned whenever this photo is swapped, same as the interior
     spread's letterbox math): the current photo (Wells Fargo Brand Activation,
     2808x1536) contain-fits to ~35.33% of panel height, so with the top pinned
     to 1cm its real bottom edge lands at ~39.96% — ramps from fully opaque at
     29.962% down to exactly transparent at 39.962%, so mask reaches 0% right
     where the photo pixels actually end. Verified via renderHtmlStringToPng +
     raw pixel sampling — no measurable jump at the true edge. */
  .panel-back .photo {
    background-image: url('${escapeAttr(photoUrls.backCoverPhotoUrl)}');
    background-position: center 1cm;
    background-size: contain;
    background-repeat: no-repeat;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, transparent 4.6%, black 14%, black 29.962%, transparent 39.962%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, transparent 4.6%, black 14%, black 29.962%, transparent 39.962%, transparent 100%);
  }
  .panel-back .tint { background: linear-gradient(180deg, rgba(18,80,43,0.30) 0%, rgba(20,22,25,0.50) 38%, rgba(15,16,18,0.86) 100%); }
  /* Client feedback: add a soft charcoal wash on top of the existing green/
     near-black legibility tint — a separate layer (not folded into .tint's
     own gradient) so it stays easy to tune independently. */
  .panel-back .charcoal-wash { position: absolute; inset: 0; z-index: 0; background: rgba(54, 60, 67, 0.28); }
  /* Client feedback: the title (now one unified two-line white headline,
     eyebrow line folded into it) read too large/loud at the old 70px poster
     size — sized down so it still reads as a clear title but keeps the flow
     of the other 3 panels' more restrained typography. */
  /* Client feedback: push the title further down so the Wells Fargo photo
     reads clearly at the top of the panel before any copy starts covering
     it — same "clear the image" push applied to both interior panels below. */
  .panel-back .big-word { font-size: 46px; margin-top: 260px; }
  .panel-back .body-copy { margin-top: 18px; }
  .panel-back .body-copy p { width: 92%; font-size: 13.5px; line-height: 1.28; }
  .panel-back .section-title { display: block; margin-top: 22px; margin-bottom: 11px; font-size: 13.5px; }
  /* Client feedback: 3 columns (was 2) for "Ideal For". */
  .panel-back .tag-grid { width: 96%; gap: 8px 10px; grid-template-columns: 1fr 1fr 1fr; }
  .panel-back .tag-item { font-size: 12px; }
  .panel-back .cta-heading { display: block; margin-top: 22px; color: var(--gold); font-size: 13.5px; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; }
  /* Client feedback: right-align the CTA copy with a forced break right at
     "options" (2 lines) instead of the old full-width left-aligned line —
     that frees horizontal space to bring the QR code up out of the bottom
     corner and into this row, and .panel-back .content's bottom padding
     below gives the requested clean 1cm margin under everything. */
  .cta-row { margin-top: auto; display: flex; align-items: flex-end; justify-content: flex-end; gap: 14px; }
  .cta-line { font-size: 16px; color: rgba(230,213,181,0.95); font-weight: 400; line-height: 1.28; text-align: right; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .qrbox { width: 68px; height: 68px; flex: 0 0 68px; background: var(--beige); border-radius: 6px; padding: 5px; box-shadow: 0 3px 14px rgba(0,0,0,0.4); }
  .qrbox img { width: 100%; height: 100%; object-fit: contain; display: block; }
  /* Client feedback: right-align to match the CTA row above it, and raise it
     an extra 0.5cm off the bottom edge (on top of .content's 1cm padding). */
  .bfoot-single { margin-top: 10px; margin-bottom: 0.5cm; font-size: 11px; color: rgba(230,213,181,0.75); text-shadow: 0 1px 4px rgba(0,0,0,0.4); text-align: right; }
  /* Client feedback: exactly 1cm of breathing room under the footer line,
     replacing the shared 0.22in bottom safety padding for this panel only. */
  .panel-back .content { padding-bottom: 1cm; }
  .panel-cover { background: var(--charcoal); }
  /* Client feedback: push the whole content block (brand row/logo included)
     down 2cm from where it sat before — top padding increased by 2cm
     (0.7874in) on top of the existing 0.22in safety cushion; bottom padding
     unchanged so the extra space only shows up at the top. */
  .panel-cover .content { padding: 1.0074in 0 0.22in 0; }
  .panel-cover .content > *:not(.pill):not(.cover-hero) { padding-left: 0.22in; padding-right: 0.22in; }
  .eyebrow { margin-top: 12px; font-size: 14px; letter-spacing: 3px; font-weight: 700; color: var(--green); text-transform: uppercase; }
  .panel-cover .big-word { font-size: 58px; margin-top: 22px; }
  .panel-cover .big-word .bw-gold { color: var(--gold); }
  .panel-cover .big-word .bw-green { color: var(--green); }
  .panel-cover .tagline { margin-top: 14px; }
  .panel-cover .tagline .lead { font-size: 23px; }
  .panel-cover .tagline .desc { font-size: 18px; max-width: 92%; }
  /* Softened to match the .glass treatment used on the interior panels
     (translucent + backdrop-blur + thin gold border) instead of a solid
     opaque beige capsule — reads quieter against the title/subtitle above
     it. Shape is a subtly rounded rectangle (10px), not a full pill/capsule. */
  .pill { margin-top: 16px; margin-left: 0.22in; align-self: flex-start;
    background: rgba(230,213,181,0.14); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(218,171,97,0.4); color: var(--beige);
    font-size: 11px; font-weight: 700; letter-spacing: 1.5px; padding: 7px 13px; border-radius: 10px; }
  /* Full-bleed to the panel's side edges (excluded from the wildcard inset
     rule above) — same width treatment as the other 3 panels' full-bleed
     photos. Fade is vertical-only (top/bottom), same mask-image technique
     already proven on .panel-back/.panel-left/.panel-right's photo, just
     without their letterbox-edge math: this img fills its box at its own
     aspect ratio with no contain/letterbox gap, so the mask only needs to
     dissolve the photo's own top/bottom into the panel's charcoal — no
     "true edge" seam to hit exactly zero at like the letterboxed panels. */
  /* Client feedback: the full-aspect-ratio photo showed too much empty plaza
     pavement below the EVs and not enough building facade above them.
     Switched from a natural-aspect <img> to a shorter fixed aspect-ratio
     background-image (cover, position biased toward the top of the source
     photo) — this crops off some of the bottom pavement while keeping the
     buildings/skyline fully in frame, and the shorter box (still bottom-
     anchored via margin-top: auto) reads as "pushed down" with more
     charcoal breathing room above it. */
  .cover-hero {
    margin-top: auto; width: 100%; aspect-ratio: 1.72; position: relative; overflow: hidden;
    background-image: url('${escapeAttr(photoUrls.coverPhotoUrl)}');
    background-size: cover; background-position: center 8%; background-repeat: no-repeat;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 32%, black 86%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, black 32%, black 86%, transparent 100%);
  }
  /* Client feedback: the wash was hiding too much of the photo (buildings
     barely visible) — opacity roughly halved at both stops so the skyline
     reads through clearly while the top edge still blends into the pill/
     tagline above it. */
  .cover-hero-tint {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(54, 60, 67, 0.30) 0%, rgba(54, 60, 67, 0.08) 30%, rgba(54, 60, 67, 0.08) 100%);
  }
</style>
</head>
<body>
<div class="sheet">

  <div class="panel panel-back">
    <div class="photo"></div>
    <div class="tint"></div>
    <div class="charcoal-wash"></div>
    <div class="grain"></div>
    <div class="content">
      ${brandRow(photoUrls.logoUrl)}
      <div class="big-word">${bigWordHtml(backCover.bigWord)}</div>
      <div class="body-copy"><p>${escapeHtml(backCover.intro)}</p></div>
      <div class="section-title">Ideal For</div>
      <div class="tag-grid">
        ${backCover.idealForList.map(item => `<div class="tag-item">${escapeHtml(item)}</div>`).join('\n        ')}
      </div>
      <div class="cta-heading">${escapeHtml(backCover.ctaHeading)}</div>
      <div class="cta-row">
        <div class="cta-line">${bigWordHtml(backCover.ctaLine)}</div>
        <div class="qrbox"><img src="${escapeAttr(photoUrls.qrUrl)}"></div>
      </div>
      <div class="bfoot-single">${footerHtml(backCover.footerText)}</div>
    </div>
  </div>

  <div class="panel panel-cover">
    <div class="grain"></div>
    <div class="content">
      ${brandRow(photoUrls.logoUrl)}
      ${eyebrowHtml}
      <div class="big-word">${coverBigWordHtml(cover.bigWord)}</div>
      <div class="tagline">${leadHtml}<div class="desc">${escapeHtml(cover.taglineDesc)}</div></div>
      <div class="pill">${escapeHtml(cover.pillText)}</div>
      <div class="cover-hero"><div class="cover-hero-tint"></div></div>
    </div>
  </div>

</div>
</body>
</html>`
}

function buildBackHtml({ content, palette, photoUrls }) {
  const { interiorLeft, interiorRight } = content
  return `<!doctype html>
<html>
<head>
${sharedHead(palette)}
<style>
  .panel-left { left: 0.065in; }
  .panel-right { left: 5.555in; }
  .tint { background: linear-gradient(180deg, rgba(18,80,43,0.30) 0%, rgba(20,22,25,0.50) 38%, rgba(15,16,18,0.86) 100%); }
  .big-word { font-size: 70px; }
  .tagline { margin-top: 10px; }
  .tagline .lead { font-size: 19px; }
  .tagline .desc { font-size: 16px; max-width: 95%; }
  /* Client feedback: interior-left and interior-right no longer get two
     independent photos — one single image now spans both panels as a
     continuous spread, split down the middle at the panel boundary. Both
     panels share the exact same background-image, background-size (the
     combined 2-panel canvas: 10.98in = panel-left width 5.49in + panel-right
     width 5.49in, since the two panels sit edge-to-edge with no gap), and
     background-position-y; only background-position-x differs (0 for the
     left half, -5.49in to shift the same canvas left by exactly one panel
     width so panel-right reveals the right half) — the classic sprite-split
     technique for one image across two adjacent equal-width boxes.
     Client also required the FULL image visible, nothing cropped — so this
     uses contain (fit-to-width, since the source is proportionally wider
     than the 10.98x8.5in combined canvas), not cover. That leaves a vertical
     letterbox gap (centered, not pushed up like the old single-photo panels
     — no client ask to push this one), faded top/bottom with the same
     zero-at-the-true-edge mask-image technique already proven elsewhere in
     this file: the ramp must hold fully transparent through the real photo
     edge and only start climbing to opaque past it, or a hard seam survives
     at the boundary (verified via renderHtmlStringToPng + raw pixel
     sampling — see the cover-hero PR history for why this matters). */
  .panel-left .photo, .panel-right .photo {
    background-image: url('${escapeAttr(photoUrls.interiorSpreadPhotoUrl)}');
    background-size: 10.98in 7.8467in;
    background-position-y: 0.3266in;
    background-repeat: no-repeat;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, transparent 3.843%, black 13.8%, black 86.2%, transparent 96.157%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, transparent 3.843%, black 13.8%, black 86.2%, transparent 96.157%, transparent 100%);
  }
  .panel-left .photo { background-position-x: 0in; }
  .panel-right .photo { background-position-x: -5.49in; }
  /* Client feedback: push the title down so the spread photo clears/shows at
     the top of each panel instead of copy starting right where the photo is
     already fully visible (the fade only softens the top ~14%, so text used
     to sit right on top of the brightest part of the image). */
  .panel-right .big-word { font-size: 44px; margin-top: 181px; }
  /* Interior-left has noticeably less copy volume than interior-right (no
     12-item tag list or 3 product cards), so it gets pushed down even
     further and sized up more on top of the shared treatment — otherwise it
     reads as lighter/emptier than its neighbor once both are pushed down. */
  /* Client feedback: shrink the glass card (below) and tighten the gap
     before it so the copy sits closer to the card — the freed-up height is
     redirected into pushing the title down even further (310px, was 250px)
     so the box-to-panel-bottom gap (which the client said is already
     perfect) stays exactly where it was. */
  .panel-left .big-word { font-size: 44px; margin-top: 160px; }
  .panel-left .body-copy, .panel-right .body-copy { margin-top: 12px; }
  .panel-left .body-copy p, .panel-right .body-copy p { font-size: 11.5px; line-height: 1.24; margin-bottom: 7px; }
  /* Client feedback: keep the title exactly where it is, but push the
     paragraphs down to sit right against the card below instead of leaving
     a gap under them — the empty space moves from between paragraphs/card
     to between title/paragraphs instead. Sum of this margin + .glass's
     margin-top below is kept constant (118px total) so the card's own top/
     bottom position — already pixel-matched to page 3's fleet cards — does
     not move. */
  .panel-left .body-copy { margin-top: 108px; }
  /* Client feedback: a tight charcoal backing directly behind just this
     beige body copy, so it reads clearly without a big rectangle blocking
     the photo — width: fit-content (capped at 94%) hugs each paragraph's
     own rendered width instead of stretching every line to the full column. */
  .panel-left .body-copy p { font-size: 13px; line-height: 1.3; margin-bottom: 10px;
    background: rgba(54, 60, 67, 0.55); padding: 3px 8px; border-radius: 4px; width: fit-content; max-width: 94%; }
  /* "WHY IT MATTERS" — three short punch lines, not a paragraph; last line
     (the pay-off) picked out in gold to match the emphasis pattern already
     used elsewhere (tagline .lead, cta-line). Client feedback: the old
     stand-alone "What You Gain" card left a big empty gap to the right of
     its short list items — merged into the SAME card as a second column
     instead of two separate blocks, so the card's own width is used fully. */
  .why-line { font-size: 15px; font-weight: 700; color: rgba(230,213,181,0.98); line-height: 1.28; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .why-line:last-child { color: var(--gold); }
  /* Client feedback: shorter card (less padding, tighter list spacing) and
     a smaller gap above it (copy sits closer) — see the .panel-left .big-word
     comment above for how the freed height is redistributed so the gap
     between the card's bottom edge and the panel's bottom edge, which the
     client confirmed is already correct, doesn't shift. */
  .panel-left .glass { margin-top: 10px; padding: 13px; }
  .panel-left .glass .col-title { font-size: 13px; margin-bottom: 6px; }
  .panel-left .glass li { font-size: 12.5px; margin-bottom: 4px; }
  .panel-left .why-line { font-size: 13.5px; line-height: 1.2; }
  /* Client feedback: lean into the SNACKET beige/green brand pair for the
     card backgrounds — "What You Gain" stays the warm beige glass card,
     "Built To Create" (.row, below) switches to a green-tinted card instead
     of sharing the same beige, so the two card types read as distinct in
     the brand's two accent colors rather than both defaulting to beige. */
  .glass { background: rgba(230,213,181,0.30); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
    border: 1px solid rgba(218,171,97,0.45); border-radius: 10px; padding: 16px; margin-top: 16px; }
  .glass--split { display: flex; gap: 18px; }
  .glass-col { flex: 1; min-width: 0; }
  .glass .col-title { font-size: 13px; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 7px; color: var(--green); }
  .glass ul { list-style: none; margin: 0; padding: 0; }
  .glass li { font-size: 12.5px; color: rgba(230,213,181,0.92); margin-bottom: 5px; padding-left: 16px; position: relative; line-height: 1.18; }
  .glass li::before { content: '+'; position: absolute; left: 0; color: var(--green); font-weight: 700; }
  /* Client feedback: narrower boxes (was 90%) and a lighter tint (was 0.30)
     so more of the spread photo shows through/around the Visibility/
     Engagement/Proof cards. */
  .row { background: rgba(var(--green-rgb), 0.16); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    border-left: 3px solid var(--green); border-radius: 0 6px 6px 0; width: 68%;
    padding: 8px 12px; margin-top: 7px; font-size: 12px; color: rgba(230,213,181,0.95); text-shadow: 0 1px 4px rgba(0,0,0,0.4); line-height: 1.15; }
  .row .rt { font-weight: 700; display: block; margin-bottom: 1px; color: #fff; }
  /* Client feedback: right-align the 3 Built-To-Create cards so the intro
     paragraph above them reads as sitting to their left. Flipped the accent
     border/corner-rounding to the right side too — anchoring the "flag"
     border to the edge the cards now sit against reads more natural than
     leaving the accent stranded in the middle of the panel. */
  .panel-right .row { margin-left: auto; border-left: none; border-right: 3px solid var(--green); border-radius: 6px 0 0 6px; }
  /* Interior-right has more content than any other panel (12-item tag grid +
     3 product cards on top of the row list), so it gets tighter section
     spacing than the shared default to compensate for the top push-down
     above without overflowing the panel's bottom edge. Client feedback:
     "Deployed For" is 3 columns here (not the shared 2-column .tag-grid
     default used by the back cover's "Ideal For"). */
  .panel-right .section-title { display: block; margin-top: 11px; margin-bottom: 5px; }
  /* Client feedback: "Built To Create" specifically sits right above the
     (right-aligned) row cards, not spanning the full panel width like the
     other two section titles on this panel. */
  /* Client feedback: align to the LEFT edge of the (right-aligned) green
     cards below, not centered/right-aligned in the full column — same
     width + margin-left: auto as .row so the outer box edges match exactly
     regardless of .row's own internal padding. */
  .panel-right .section-title--right { display: block; width: 68%; margin-left: auto; text-align: left; }
  .panel-right .tag-grid { width: 97%; margin-bottom: 3px; grid-template-columns: 1fr 1fr 1fr; }
  .panel-right .tag-item { font-size: 10px; }
  /* Client feedback: no QR on this panel anymore (page 4's back cover
     already has one) — a small circular logo mark instead, and the
     brand-row/wordmark that used to sit at the top of this panel is gone
     too, since the spread only needs the SNACKET wordmark once (page 2). */
  .panel-right .logo-corner { position: absolute; top: 0.22in; right: 0.22in; width: 52px; height: 52px;
    border-radius: 50%; overflow: hidden; background: #fff; box-shadow: 0 0 0 2.5px rgba(230,213,181,0.9), 0 3px 14px rgba(0,0,0,0.4); padding: 3.5px; z-index: 3; }
  .panel-right .logo-corner img { width: 100%; height: 100%; object-fit: contain; display: block; }
  /* Client feedback: same tight per-paragraph charcoal backing as interior-
     left's body copy (see that panel's comment) — this panel only has the
     one intro paragraph, but the treatment should match. */
  .panel-right .body-copy p { background: rgba(54, 60, 67, 0.55); padding: 3px 8px; border-radius: 4px; width: fit-content; max-width: 94%; }
  .fleet { margin-top: 8px; display: flex; gap: 8px; }
  .fleet-card { flex: 1; border: 1px solid var(--green); border-radius: 7px; padding: 7px 9px; background: rgba(var(--green-rgb), 0.26); backdrop-filter: blur(5px); }
  .fleet-card b { display: block; color: var(--green); font-size: 11px; font-weight: 700; margin-bottom: 2px; }
  .fleet-card span { display: block; color: rgba(230,213,181,0.9); font-size: 9.5px; line-height: 1.15; }
</style>
</head>
<body>
<div class="sheet">

  <div class="panel panel-left">
    <div class="photo"></div>
    <div class="tint"></div>
    <div class="grain"></div>
    <div class="content">
      ${brandRow(photoUrls.logoUrl, 'compact')}
      <div class="big-word">${bigWordHtml(interiorLeft.bigWord)}</div>
      <div class="body-copy">
        ${interiorLeft.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n        ')}
      </div>
      <div class="glass glass--split">
        <div class="glass-col">
          <div class="col-title">Why It Matters</div>
          <div class="why-lines">
            ${interiorLeft.whyItMattersLines.map(line => `<div class="why-line">${escapeHtml(line)}</div>`).join('\n            ')}
          </div>
        </div>
        <div class="glass-col">
          <div class="col-title">What You Gain</div>
          <ul>
            ${interiorLeft.whatYouGainList.map(item => `<li>${escapeHtml(item)}</li>`).join('\n            ')}
          </ul>
        </div>
      </div>
    </div>
  </div>

  <div class="panel panel-right">
    <div class="photo"></div>
    <div class="tint"></div>
    <div class="grain"></div>
    <div class="content">
      <div class="logo-corner"><img src="${escapeAttr(photoUrls.logoUrl)}"></div>
      <div class="big-word">${bigWordHtml(interiorRight.bigWord)}</div>
      <div class="body-copy"><p>${escapeHtml(interiorRight.intro)}</p></div>
      <div class="section-title section-title--right">Built To Create</div>
      ${interiorRight.builtToCreate.map(row => `<div class="row"><span class="rt">${escapeHtml(row.label)}</span>${escapeHtml(row.desc)}</div>`).join('\n      ')}
      <div class="section-title">Deployed For</div>
      <div class="tag-grid">
        ${interiorRight.deployedForList.map(item => `<div class="tag-item">${escapeHtml(item)}</div>`).join('\n        ')}
      </div>
      <div class="section-title">Configured To Match Your Experience</div>
      <div class="fleet">
        ${interiorRight.fleetCards.map(card => `<div class="fleet-card"><b>${escapeHtml(card.name)}</b><span>${escapeHtml(card.desc)}</span></div>`).join('\n        ')}
      </div>
    </div>
  </div>

</div>
</body>
</html>`
}

module.exports = { buildFrontHtml, buildBackHtml }
