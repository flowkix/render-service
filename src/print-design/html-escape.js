function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// escapeHtml only covers &/</>, insufficient for values landing inside quoted
// CSS url()/HTML attribute contexts (photo URLs) — also escape quotes here.
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;').replace(/"/g, '&quot;')
}

module.exports = { escapeHtml, escapeAttr }
