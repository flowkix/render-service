'use strict'

// Fixed content, one-time asset — not parameterized like bifold-html.js, since this
// PDF is generated once as a static lead-magnet, never per-client. Copy verified
// line-by-line against clt-alliance/index.html; see
// docs/superpowers/specs/2026-07-27-clt-alliance-guide-download-design.md.
function buildGuideHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:816px; height:1056px; font-family:'Barlow', sans-serif; background:#fff; overflow:hidden; }
  .cond { font-family:'Barlow Condensed', sans-serif; }

  /* ===== HERO ===== */
  .hero { position:relative; height:390px; background-size:cover; background-position:center 38%; }
  .hero-overlay { position:absolute; inset:0; background:linear-gradient(100deg, rgba(54,60,67,0.92) 0%, rgba(54,60,67,0.75) 42%, rgba(54,60,67,0.15) 75%); }
  .hero-top { position:absolute; top:0; left:0; right:0; display:flex; align-items:center; justify-content:space-between; padding:20px 34px; }
  .hero-top img.snacket-logo { height:42px; }
  .hero-partner { display:flex; align-items:center; gap:12px; }
  .hero-partner-label { font-size:9px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; color:#88AD59; text-align:right; line-height:1.3; }
  .hero-partner img.clt-logo { height:34px; }
  .hero-text { position:absolute; top:88px; left:34px; width:420px; color:#E6D5B5; }
  .hero-kicker { color:#88AD59; font-size:11px; font-weight:800; letter-spacing:2px; text-transform:uppercase; margin-bottom:10px; }
  .hero-h1 { font-weight:900; font-size:44px; text-transform:uppercase; line-height:0.98; margin-bottom:8px; }
  .hero-sub { font-weight:700; font-size:19px; color:#DAAB61; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px; line-height:1.15; }
  .hero-body { font-size:11.5px; color:rgba(230,213,181,0.82); line-height:1.55; width:340px; }

  /* ===== BENEFITS ===== */
  .benefits { padding:10px 34px 8px; border-bottom:1px solid #EEE2CC; }
  .benefits-lead { font-size:16px; font-weight:900; color:#363C43; text-transform:uppercase; letter-spacing:0.2px; }
  .benefits-lead em { color:#88AD59; font-style:normal; }
  .icon-row { display:flex; justify-content:space-between; margin-top:10px; gap:6px; }
  .icon-item { text-align:center; flex:1; }
  .icon-item svg { width:26px; height:26px; }
  .icon-label { font-size:8.3px; font-weight:800; letter-spacing:0.2px; text-transform:uppercase; color:#363C43; line-height:1.25; margin-top:4px; }

  /* ===== EXPERIENCE ===== */
  .experience { display:flex; height:180px; background:#363C43; padding:10px; gap:10px; }
  .exp-photo { flex:0 0 44%; background-size:cover; background-position:center; position:relative; border-radius:3px; }
  .exp-photo .cap { position:absolute; bottom:10px; left:10px; right:10px; background:rgba(54,60,67,0.8); color:#E6D5B5; font-size:8px; padding:5px 9px; letter-spacing:0.5px; text-transform:uppercase; border-radius:2px; }
  .exp-text { flex:1; color:#E6D5B5; padding:12px 20px; display:flex; flex-direction:column; justify-content:center; }
  .exp-eyebrow { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:#88AD59; margin-bottom:8px; }
  .exp-title { font-size:22px; font-weight:900; text-transform:uppercase; line-height:1.08; margin-bottom:10px; }
  .exp-title em { color:#88AD59; font-style:normal; }
  .exp-desc { font-size:9.5px; color:rgba(230,213,181,0.7); line-height:1.45; margin-bottom:12px; }
  .checklist { list-style:none; display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; font-size:9.5px; }
  .checklist li:before { content:"✓ "; color:#88AD59; font-weight:800; }

  /* ===== HOW IT WORKS ===== */
  .steps { display:flex; align-items:center; justify-content:center; padding:6px 34px; background:#F5EFE3; gap:14px; }
  .step { text-align:center; width:150px; }
  .step svg { width:22px; height:22px; }
  .step-num-wrap { display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:5px; }
  .step-num { width:20px; height:20px; border-radius:50%; background:#88AD59; color:#fff; font-weight:900; font-size:10px; display:flex; align-items:center; justify-content:center; }
  .step-title { font-size:11px; font-weight:800; text-transform:uppercase; color:#363C43; }
  .step-desc { font-size:8px; color:#8a8478; margin-top:2px; line-height:1.3; }
  .step-arrow { color:#DAAB61; font-size:16px; }

  /* ===== PRICING ===== */
  .pricing { padding:10px 34px 6px; }
  .pricing-head { text-align:center; margin-bottom:6px; }
  .pricing-head .lbl { font-size:9px; font-weight:800; letter-spacing:2px; color:#88AD59; text-transform:uppercase; }
  .pricing-head h2 { font-size:22px; font-weight:900; color:#363C43; text-transform:uppercase; }
  .tiers { display:flex; gap:12px; }
  .tier { flex:1; background:#fff; border:1px solid #E0D6BF; border-radius:4px; padding:10px 12px; position:relative; }
  .tier.signature { border:2px solid #DAAB61; }
  .badge { position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:#DAAB61; color:#363C43; font-size:7.5px; font-weight:800; padding:3px 10px; border-radius:2px; white-space:nowrap; letter-spacing:0.5px; text-transform:uppercase; }
  .tier-name { font-size:11px; font-weight:800; text-transform:uppercase; color:#363C43; text-align:center; margin-bottom:2px; }
  .tier-price { font-size:26px; font-weight:900; color:#363C43; text-align:center; margin-bottom:4px; }
  .tier-bestfor { font-size:8px; color:#8a8478; text-align:center; margin-bottom:8px; line-height:1.35; min-height:28px; }
  .tier ul { list-style:none; font-size:8.3px; color:#4a453d; line-height:1.65; }
  .tier li:before { content:"✓ "; color:#88AD59; }

  /* ===== FOOTER ===== */
  .footer { background:#363C43; color:#E6D5B5; padding:10px 34px; display:flex; align-items:center; justify-content:space-between; margin-top:4px; }
  .footer-tags { display:flex; gap:22px; }
  .footer-tag b { display:block; font-size:9px; color:#E6D5B5; text-transform:uppercase; letter-spacing:0.3px; }
  .footer-tag span { font-size:7.5px; color:rgba(230,213,181,0.55); }
  .footer-contact { text-align:right; }
  .footer-contact .l1 { font-size:11px; font-weight:700; color:#E6D5B5; }
  .footer-contact .l2 { font-size:9px; color:#88AD59; margin-top:2px; }
</style>
</head>
<body>

  <div class="hero" style="background-image:url('https://snacketnow.com/assets/images/photos/activations/snacket-plaza-activation-crowd.png')">
    <div class="hero-overlay"></div>
    <div class="hero-top">
      <img class="snacket-logo" src="https://snacketnow.com/assets/images/logo-snacket.png">
      <div class="hero-partner">
        <div class="hero-partner-label">Exclusive Experience<br>Partner</div>
        <img class="clt-logo" src="https://snacketnow.com/assets/images/clt-alliance-foundation-logo.png">
      </div>
    </div>
    <div class="hero-text">
      <p class="hero-kicker cond">CLT Alliance Coffee Connect Series &middot; Charlotte, NC</p>
      <p class="hero-h1 cond">Hosting Coffee<br>Connect?</p>
      <p class="hero-sub cond">Make Your Event The One Everyone Remembers.</p>
      <p class="hero-body">Instead of a traditional coffee setup, transform your Coffee Connect into a professionally branded networking experience that reflects your company from the moment guests arrive.</p>
    </div>
  </div>

  <div class="benefits">
    <p class="benefits-lead cond">Hosting Coffee Connect Is Already A Great Opportunity. <em>Now Make It Memorable.</em></p>
    <div class="icon-row">
      <div class="icon-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="#88AD59" stroke-width="1.6"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2z"/></svg>
        <div class="icon-label">Stronger First<br>Impression</div>
      </div>
      <div class="icon-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="#88AD59" stroke-width="1.6"><path d="M12 2l7 3v6c0 5-3 8.5-7 10.5C8 19.5 5 16 5 11V5l7-3z"/></svg>
        <div class="icon-label">Reinforce<br>Your Brand</div>
      </div>
      <div class="icon-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="#88AD59" stroke-width="1.6"><circle cx="8" cy="8" r="3.2"/><circle cx="16" cy="8" r="3.2"/><path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5"/></svg>
        <div class="icon-label">Encourage<br>Networking</div>
      </div>
      <div class="icon-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="#88AD59" stroke-width="1.6"><rect x="3" y="4" width="18" height="12" rx="1.2"/><path d="M9 20h6M12 16v4"/><circle cx="8" cy="9" r="1.3" fill="#88AD59" stroke="none"/><path d="M6 13l3.5-3.5 2 2L16 8"/></svg>
        <div class="icon-label">Professional<br>Presentation</div>
      </div>
      <div class="icon-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="#88AD59" stroke-width="1.6"><path d="M12 20s-7-4.3-9-8.8C1.4 7.8 3 5 6 5c2 0 3.3 1.2 4 2.4C10.7 6.2 12 5 14 5c3 0 4.6 2.8 3 6.2C15 15.7 12 20 12 20z"/></svg>
        <div class="icon-label">Memorable<br>Experience</div>
      </div>
      <div class="icon-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="#88AD59" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.3 2.3 4.7-5"/></svg>
        <div class="icon-label">Zero Logistics<br>For You</div>
      </div>
    </div>
  </div>

  <div class="experience">
    <div class="exp-photo" style="background-image:url('https://snacketnow.com/assets/images/photos/activations/snacket-clt-alliance-rooftop-activation.png'); background-position:center 35%;">
      <div class="cap">Charlotte Regional Business Alliance &middot; Host Enhancement</div>
    </div>
    <div class="exp-text">
      <p class="exp-eyebrow cond">Included With Every Coffee Connect</p>
      <p class="exp-title cond">Your Branded<br><em>Guest Experience</em></p>
      <p class="exp-desc">Every Coffee Connect host receives a fully staffed SNACKET EV, hot coffee, a trained on-site operator, and standard setup through the Alliance partnership.</p>
      <ul class="checklist">
        <li>Fully Electric SNACKET EV</li>
        <li>Trained On-Site Operator</li>
        <li>Hot Coffee Service</li>
        <li>1.5-Hour Activation Window</li>
        <li>Professional Setup &amp; Teardown</li>
        <li>Optional Pastries Available</li>
      </ul>
    </div>
  </div>

  <div class="steps">
    <div class="step">
      <div class="step-num-wrap"><div class="step-num">1</div><svg viewBox="0 0 24 24" fill="none" stroke="#363C43" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>
      <div class="step-title cond">Compare</div>
      <p class="step-desc">Review the Included, Enhanced, and Signature options.</p>
    </div>
    <div class="step-arrow">&rarr;</div>
    <div class="step">
      <div class="step-num-wrap"><div class="step-num">2</div><svg viewBox="0 0 24 24" fill="none" stroke="#363C43" stroke-width="1.6"><path d="M4 20l4-1 10-10-3-3L5 16l-1 4z"/></svg></div>
      <div class="step-title cond">Customize</div>
      <p class="step-desc">Tell us which branding and experience elements fit your event.</p>
    </div>
    <div class="step-arrow">&rarr;</div>
    <div class="step">
      <div class="step-num-wrap"><div class="step-num">3</div><svg viewBox="0 0 24 24" fill="none" stroke="#363C43" stroke-width="1.6"><path d="M4 9h13a2 2 0 010 6" fill="none"/><path d="M4 9v8a2 2 0 002 2h7a2 2 0 002-2V9"/><path d="M8 5c0 1-1 1-1 2M12 5c0 1-1 1-1 2"/></svg></div>
      <div class="step-title cond">Host</div>
      <p class="step-desc">SNACKET handles setup, operation, and teardown.</p>
    </div>
  </div>

  <div class="pricing">
    <div class="pricing-head">
      <p class="lbl cond">Choose Your Level</p>
      <h2 class="cond">The Host Enhancement</h2>
    </div>
    <div class="tiers">
      <div class="tier">
        <p class="tier-name">Included Through the Alliance</p>
        <p class="tier-price">$0</p>
        <p class="tier-bestfor">A professionally managed Coffee Connect experience without additional customization.</p>
        <ul>
          <li>Fully electric SNACKET EV</li>
          <li>Hot coffee service</li>
          <li>Trained on-site operator</li>
          <li>Standard SNACKET setup</li>
          <li>1.5-hour service window</li>
          <li>Setup &amp; teardown by SNACKET</li>
        </ul>
      </div>
      <div class="tier">
        <p class="tier-name">Enhanced Host Experience</p>
        <p class="tier-price">$1,350</p>
        <p class="tier-bestfor">Your brand visibly featured throughout the Coffee Connect event.</p>
        <ul>
          <li>Everything through the Alliance</li>
          <li>Custom interior branding &amp; logo</li>
          <li>One LED screen, static image</li>
          <li>Pre-event branding coordination</li>
          <li>Digital artwork review</li>
          <li>Exterior branding available</li>
        </ul>
      </div>
      <div class="tier signature">
        <div class="badge">This Becomes The Premium Option</div>
        <p class="tier-name">Signature Host Experience</p>
        <p class="tier-price">$2,500</p>
        <p class="tier-bestfor">A complete branded showcase with expanded media, décor, and engagement.</p>
        <ul>
          <li>Everything in Enhanced</li>
          <li>Up to two LED screens</li>
          <li>Client-provided promo video option</li>
          <li>Branded balloon décor</li>
          <li>Custom welcome signage</li>
          <li>QR code for lead capture</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-tags">
      <div class="footer-tag cond"><b>Fully Electric</b><span>Sustainable &amp; Quiet</span></div>
      <div class="footer-tag cond"><b>Locally Owned</b><span>Charlotte Proud</span></div>
      <div class="footer-tag cond"><b>Designed for Networking</b><span>Professionally Managed</span></div>
    </div>
    <div class="footer-contact">
      <p class="l1 cond">info@snacketfoods.net &middot; (704) 449-3542</p>
      <p class="l2 cond">snacketnow.com/clt-alliance</p>
    </div>
  </div>

</body>
</html>`
}

module.exports = { buildGuideHtml }
