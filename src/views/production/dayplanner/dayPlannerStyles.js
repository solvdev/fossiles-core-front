/**
 * Estilos de «Armar el día». Van en una hoja propia bajo `.dp` (como el Centro con `.tbs`)
 * para no tocar los estilos globales. Pensados para tableta: botones de al menos 48 px y
 * texto de 16 px.
 */
export const DAY_PLANNER_CSS = `
.dp{--dp-ok:#6bd098;--dp-near:#fbc658;--dp-over:#ef8157;--dp-opl:#1b5e20;--dp-line:#e3e3e3;--dp-muted:#66615b;--dp-primary:#1d7fa3;--dp-go:#2e7d32;font-size:16px}
.dp .btn{min-height:48px;font-weight:700}
.dp .btn.dp-sm{min-height:44px;font-weight:600}
.dp .btn.dp-big{min-height:56px;font-size:18px;padding-left:26px;padding-right:26px}
.dp .dp-link{background:none;border:0;color:var(--dp-primary);text-decoration:underline;min-height:44px;padding:0 6px;font-weight:600;cursor:pointer}
.dp .dp-icon{width:44px;height:44px;border-radius:8px;border:1px solid #b9b4aa;background:#fff;font-size:20px;line-height:1;font-weight:700;padding:0;cursor:pointer}
.dp .dp-icon[disabled]{opacity:.35;cursor:not-allowed}
.dp select.dp-select{min-height:44px;border:1px solid #c9c4bb;border-radius:8px;padding:0 8px;background:#fff;max-width:100%}

.dp-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:12px}
.dp-head h4{margin:0}
.dp-head .dp-grow{flex:1 1 220px}
.dp-seg{display:inline-flex;border:1px solid #c9c4bb;border-radius:8px;overflow:hidden;background:#fff}
.dp-seg button{border:0;background:#fff;padding:0 16px;min-height:48px;cursor:pointer}
.dp-seg button+button{border-left:1px solid #c9c4bb}
.dp-seg button[aria-pressed="true"]{background:var(--dp-primary);color:#fff;font-weight:700}

.dp-step{background:#fff;border:1px solid var(--dp-line);border-radius:10px;margin-bottom:12px;overflow:hidden}
.dp-step>.dp-step-head{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:12px 16px;min-height:60px}
.dp-num{flex:none;width:36px;height:36px;border-radius:50%;background:#d9d5cc;color:#fff;display:grid;place-items:center;font-weight:800}
.dp-step.is-active .dp-num{background:var(--dp-primary)}
.dp-step.is-done .dp-num{background:#1e6b45}
.dp-ttl{font-size:18px;font-weight:800;flex:1 1 auto}
.dp-sum{color:var(--dp-muted);flex:1 1 100%;padding-left:48px;margin-top:-4px}
.dp-step.is-locked{opacity:.55}
.dp-step>.dp-body{padding:4px 16px 18px;border-top:1px solid var(--dp-line)}

.dp-note{border-radius:8px;padding:12px 14px;margin:12px 0;border:1px solid;display:flex;gap:10px;align-items:flex-start}
.dp-note .dp-x{flex:1}
.dp-note.warn{background:#fff7e0;border-color:#f3d37a;color:#5f4700}
.dp-note.info{background:#e8f6fb;border-color:#a7dcee;color:#0b5c75}
.dp-note.bad{background:#fdece6;border-color:#f3b49f;color:#a3300f}
.dp-note.good{background:#e6f6ee;border-color:#a8dcc0;color:#1e6b45}
.dp-state{text-align:center;padding:32px 12px}
.dp-state .dp-big-icon{font-size:40px}

.dp-sec{margin-top:14px}
.dp-sec-h{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;font-weight:800}
.dp-sec-h.opl{background:var(--dp-opl);color:#fff}
.dp-sec-h.opl .dp-tag{background:#fff;color:var(--dp-opl);border-radius:999px;padding:2px 10px;font-size:13px;letter-spacing:.04em}
.dp-sec-h.others{background:#eceae4}
.dp-sec-h .dp-sp{flex:1}
.dp-sec-h .btn{min-height:44px;color:#2c2c2c;background:#fff;border:1px solid #b9b4aa}
.dp-orow{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;padding:10px 8px;border-bottom:1px solid var(--dp-line)}
.dp-orow.is-sel{background:#f5fbf8}
.dp-orow.is-opl{border-left:6px solid var(--dp-opl);padding-left:8px}
.dp-chk{position:relative;flex:none;width:48px;height:48px;display:grid;place-items:center;cursor:pointer;margin:0}
.dp-chk input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer}
.dp-chk .dp-box{width:34px;height:34px;border:2px solid #8d877d;border-radius:8px;background:#fff;display:grid;place-items:center;font-weight:800;color:#fff}
.dp-chk input:checked+.dp-box{background:var(--dp-primary);border-color:var(--dp-primary)}
.dp-chk input:focus-visible+.dp-box{outline:3px solid #1d7fa3;outline-offset:2px}
.dp-omain{flex:1 1 220px;min-width:0}
.dp-otop{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.dp-otop strong{font-size:17px}
.dp-muted{color:var(--dp-muted)}
.dp-ometa{color:var(--dp-muted);font-size:14px;margin-top:2px}
.dp-detail{flex:1 1 100%;margin:0 0 4px 60px;background:#faf9f6;border:1px solid var(--dp-line);border-radius:8px;padding:8px 12px}
.dp-detail div{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed var(--dp-line)}
.dp-detail div:last-child{border:0}
.dp-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0}
.dp-tools input[type=search]{flex:1 1 220px;min-height:48px;border:1px solid #c9c4bb;border-radius:8px;padding:0 12px}
.dp-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.dp-chips button{min-height:44px;border-radius:999px;border:1px solid #b9b4aa;background:#fff;padding:0 16px;cursor:pointer}
.dp-chips button[aria-pressed="true"]{background:var(--dp-primary);color:#fff;border-color:var(--dp-primary)}

.dp-tcard{border:1px solid var(--dp-line);border-radius:10px;margin-top:12px;background:#fff;overflow:hidden}
.dp-tcard.lv-over{border-color:var(--dp-over);box-shadow:0 0 0 2px #fbd9cc}
.dp-tcard.lv-opl{border-left:6px solid var(--dp-opl)}
.dp-thead{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:12px 14px}
.dp-tn{font-weight:800;font-size:18px}
.dp-chip{display:inline-block;border-radius:999px;padding:3px 12px;font-size:14px;font-weight:700}
.dp-chip.ok{background:#dff5e9;color:#1e6b45}.dp-chip.near{background:#fff0c4;color:#7a5a00}
.dp-chip.over{background:#fbd9cc;color:#a3300f}.dp-chip.opl{background:#dcedc8;color:#33691e}
.dp-cap{padding:0 14px 12px}
.dp-cap .dp-cap-txt{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-weight:700;margin-bottom:4px}
.dp-track{position:relative;height:16px;background:#ebe8e1;border-radius:999px}
.dp-fill{height:100%;border-radius:999px;transition:width .25s}
.dp-fill.ok{background:var(--dp-ok)}.dp-fill.near{background:var(--dp-near)}.dp-fill.over{background:var(--dp-over)}
.dp-fill.opl{background:repeating-linear-gradient(135deg,#aed581 0 8px,#c5e1a5 8px 16px)}
.dp-tick{position:absolute;top:-4px;bottom:-4px;width:2px;background:#4d4a45}
.dp-scale{position:relative;height:18px;font-size:12px;color:var(--dp-muted);margin-top:4px}
.dp-scale span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.dp-scale span:first-child{transform:none}
.dp-scale span:last-child{transform:translateX(-100%)}
.dp-tbody{border-top:1px solid var(--dp-line);padding:8px 14px 12px;background:#fcfbf9}
.dp-line{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 0;border-bottom:1px dashed var(--dp-line)}
.dp-line .dp-nm{flex:1 1 200px;min-width:0}
.dp-line .dp-nm small{color:var(--dp-muted);display:block}
.dp-qty{display:inline-flex;align-items:center;gap:6px}
.dp-qty output{min-width:36px;text-align:center;font-weight:800;font-size:18px}
.dp-tfoot{display:flex;flex-wrap:wrap;gap:8px;padding:8px 0 4px;align-items:center}
.dp-addlist{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.dp-tray{margin-top:16px;border:2px dashed #c9c4bb;border-radius:10px;padding:10px 14px}
.dp-tray ul{margin:12px 0;padding:0;list-style:none}
.dp-tray li{display:flex;flex-wrap:wrap;gap:6px 12px;padding:8px 4px;border-bottom:1px solid var(--dp-line)}

.dp-prow{display:grid;grid-template-columns:minmax(150px,1.3fr) minmax(100px,1fr) 150px 150px;gap:8px 12px;align-items:center;padding:10px 6px;border-bottom:1px solid var(--dp-line)}
.dp-prow.is-head{font-size:13px;color:var(--dp-muted);font-weight:800;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid var(--dp-line)}
.dp-prow .dp-tt strong{display:block}
.dp-mini{height:10px;background:#ebe8e1;border-radius:999px;overflow:hidden}
.dp-mini i{display:block;height:100%}
.dp-small{font-size:13px;color:var(--dp-muted)}
.dp-deskgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:8px}
.dp-desk{border:1px solid var(--dp-line);border-radius:8px;padding:8px;background:#fff;font-size:14px}
.dp-desk .dp-stack{display:flex;height:10px;background:#ebe8e1;border-radius:999px;overflow:hidden;margin-top:4px}
.dp-desk .dp-stack i{display:block;height:100%}
.dp-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--dp-muted);margin:6px 0}
.dp-legend b{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:4px}

.dp-okbox{text-align:center;padding:22px 8px 8px}
.dp-okbox .dp-ck{width:72px;height:72px;border-radius:50%;background:#1e6b45;color:#fff;display:grid;place-items:center;font-size:40px;margin:0 auto 8px}
.dp-actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:16px 0}
.dp-list{margin:12px 0;padding:0;list-style:none}
.dp-list li{display:flex;flex-wrap:wrap;gap:6px 12px;padding:10px 4px;border-bottom:1px solid var(--dp-line)}

.dp-bottom{position:sticky;bottom:0;z-index:5;background:#fff;border-top:1px solid var(--dp-line);box-shadow:0 -4px 14px rgba(0,0,0,.06);margin:16px -15px 0;padding:10px 15px}
.dp-bottom-in{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.dp-hint{flex:1 1 220px;color:var(--dp-muted)}
.dp-hint b{color:#2c2c2c}
.dp-skel{height:56px;border-radius:8px;margin:10px 0;background:linear-gradient(90deg,#eceae4,#f7f6f2,#eceae4);background-size:200% 100%;animation:dp-sh 1.2s infinite}
@keyframes dp-sh{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.dp-fill,.dp-skel{transition:none;animation:none}}
@media (max-width:700px){
  .dp-prow{grid-template-columns:1fr 1fr}
  .dp-prow.is-head{display:none}
  .dp-prow .dp-tt{grid-column:1 / -1}
  .dp-detail{margin-left:0}
  .dp-bottom .dp-hint{flex:1 1 100%;order:-1;font-size:14px}
  .dp-bottom .btn{flex:1 1 0;padding-left:10px;padding-right:10px}
}
`;
