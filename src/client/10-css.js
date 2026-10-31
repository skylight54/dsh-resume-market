/**
 * 简历市场 client — 10 面板样式。
 * 只依赖 DSH 主题 token（--dsw-alias-*），跟随亮/暗主题；纸张本身永远是白底。
 */
var RM_CSS = `
.rm-root{height:100%;min-height:320px;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1d2129);font:13px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;overflow:hidden;position:relative;}
.rm-root *{box-sizing:border-box;}
.rm-top{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafbfc);flex:0 0 auto;flex-wrap:wrap;}
.rm-logo{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:linear-gradient(135deg,#2f6fde,#7ccab6);color:#fff;font-weight:700;font-size:13px;flex:0 0 auto;}
.rm-brand{display:flex;flex-direction:column;line-height:1.25;min-width:0}
.rm-brand b{font-size:14.5px;font-weight:650;letter-spacing:.02em}
.rm-brand span{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}
.rm-top-actions{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rm-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--dsw-alias-border-l2,#cbd5e1);background:var(--dsw-alias-bg-layer-2,#f1f3f6);color:var(--dsw-alias-label-primary,#1d2129);border-radius:8px;padding:5px 11px;font:inherit;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;line-height:1.5;transition:background .15s ease,border-color .15s ease,transform .06s ease}
.rm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1,#e8ebf0);border-color:var(--dsw-alias-brand-primary,#2f6fde)}
.rm-btn:active:not(:disabled){transform:translateY(1px)}
.rm-btn:disabled{opacity:.45;cursor:not-allowed}
.rm-btn-primary{background:var(--dsw-alias-brand-primary,#2f6fde);border-color:var(--dsw-alias-brand-primary,#2f6fde);color:var(--dsw-alias-bg-base,#fff);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.18)}
.rm-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary,#2f6fde);filter:brightness(1.1);border-color:transparent}
.rm-btn-danger{color:var(--dsw-alias-state-error-primary,#dc2626);border-color:var(--dsw-alias-border-l1,#e5e7eb)}
.rm-btn-sm{padding:3px 8px;font-size:11.5px;border-radius:7px}
.rm-tabs{display:flex;gap:2px;padding:6px 14px 0;background:var(--dsw-alias-bg-layer-1,#fafbfc);border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);flex:0 0 auto;overflow-x:auto}
.rm-tab{appearance:none;border:1px solid transparent;border-bottom:0;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);padding:7px 14px;border-radius:8px 8px 0 0;font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}
.rm-tab:hover{color:var(--dsw-alias-label-primary,#1d2129)}
.rm-tab.is-on{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1d2129);border-color:var(--dsw-alias-border-l1,#e5e7eb);position:relative;top:1px;font-weight:600}
.rm-stage{flex:1 1 auto;min-height:0;display:flex;overflow:hidden}
.rm-editor{display:grid;grid-template-columns:minmax(320px,.95fr) minmax(380px,1.05fr);width:100%;height:100%;min-height:0}
@media (max-width:1180px){.rm-editor{grid-template-columns:1fr}.rm-preview-col{display:none}}
.rm-form{padding:16px 18px 48px;overflow:auto;min-height:0}
.rm-preview-col{border-left:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafbfc);display:flex;flex-direction:column;min-height:0}
.rm-preview-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);flex:0 0 auto;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280)}
.rm-preview-bar b{font-size:12px;color:var(--dsw-alias-label-primary,#1d2129);font-weight:600}
.rm-preview-viewport{flex:1 1 auto;overflow:auto;padding:18px 14px 30px;display:flex;justify-content:center;align-items:flex-start}
.rm-paper-frame{box-shadow:0 10px 30px rgba(15,23,42,.16);background:#fff;transform-origin:top left}
.rm-scaled{overflow:hidden;position:relative;flex:0 0 auto}
.rm-scaled-inner{transform-origin:top left;position:absolute;top:0;left:0}
.rm-card{border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);margin:0 0 12px;overflow:hidden}
.rm-card-h{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafbfc);flex-wrap:wrap}
.rm-card-h h3{margin:0;font-size:12.5px;font-weight:650;letter-spacing:.03em}
.rm-card-h .rm-muted{font-size:11px}
.rm-card-h .rm-tools{margin-left:auto;display:flex;gap:6px}
.rm-card-b{padding:12px}
.rm-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
.rm-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.rm-field-k{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);letter-spacing:.02em}
.rm-field-wide{grid-column:1/-1}
.rm-input{width:100%;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:8px;padding:6px 9px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary,#1d2129);outline:none}
.rm-input::placeholder{color:var(--dsw-alias-label-secondary,#9aa1ab);opacity:.7}
.rm-input:focus{border-color:var(--dsw-alias-brand-primary,#2f6fde);box-shadow:0 0 0 2px rgba(47,111,222,.16)}
.rm-textarea{resize:vertical;line-height:1.6;min-height:62px;font-family:inherit}
.rm-list{display:flex;flex-direction:column;gap:10px}
.rm-item-edit{border:1px dashed var(--dsw-alias-border-l2,#d8dce2);border-radius:10px;padding:10px;background:var(--dsw-alias-bg-base,#fff)}
.rm-item-edit-h{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.rm-item-idx{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}
.rm-item-tools{margin-left:auto;display:flex;gap:4px}
.rm-mini{appearance:none;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);border-radius:6px;width:23px;height:23px;line-height:1;cursor:pointer;font-size:11px;padding:0}
.rm-mini:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1d2129);border-color:var(--dsw-alias-border-l2,#cbd5e1)}
.rm-mini:disabled{opacity:.35;cursor:not-allowed}
.rm-mini.rm-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary,#dc2626);border-color:currentColor}
.rm-add{margin-top:10px;border:1px dashed var(--dsw-alias-border-l2,#d8dce2);background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);border-radius:9px;padding:7px;font:inherit;font-size:12px;cursor:pointer;width:100%}
.rm-add:hover{color:var(--dsw-alias-brand-primary,#2f6fde);border-color:var(--dsw-alias-brand-primary,#2f6fde)}
.rm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(206px,1fr));gap:14px;padding:16px 18px 48px;overflow:auto;align-content:start;width:100%}
.rm-tpl{border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);overflow:hidden;display:flex;flex-direction:column}
.rm-tpl.is-current{border-color:var(--dsw-alias-brand-primary,#2f6fde);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#2f6fde)}
.rm-tpl-thumb{background:#eef1f5;display:flex;justify-content:center;overflow:hidden;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);flex:0 0 auto}
.rm-tpl-body{padding:9px 11px 11px;display:flex;flex-direction:column;gap:5px;min-width:0}
.rm-tpl-name{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:650}
.rm-tpl-tag{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rm-tpl-foot{display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap}
.rm-tpl-foot .rm-muted{font-size:10.5px}
.rm-pill{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;font-size:10.5px;background:var(--dsw-alias-bg-layer-2,#eef1f5);color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap}
.rm-pill-brand{background:rgba(47,111,222,.12);color:var(--dsw-alias-brand-primary,#2f6fde)}
.rm-pill-warn{background:rgba(245,158,11,.14);color:var(--dsw-alias-state-warn-primary,#b45309)}
.rm-muted{color:var(--dsw-alias-label-secondary,#6b7280)}
.rm-mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}
.rm-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rm-col{display:flex;flex-direction:column;gap:8px}
.rm-empty{padding:44px 20px;text-align:center;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12.5px;width:100%}
.rm-toast{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);padding:7px 14px;border-radius:9px;font-size:12px;background:var(--dsw-alias-bg-layer-2,#1f2329);color:var(--dsw-alias-label-primary,#fff);border:1px solid var(--dsw-alias-border-l2,#374151);box-shadow:0 10px 28px rgba(0,0,0,.22);z-index:20;max-width:80%;text-align:center}
.rm-toast.is-err{border-color:var(--dsw-alias-state-error-primary,#dc2626);color:var(--dsw-alias-state-error-primary,#dc2626)}
.rm-modal{position:absolute;inset:0;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:24px;z-index:30;overflow:auto}
.rm-modal-card{width:min(520px,100%);background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.28);overflow:hidden}
.rm-modal-h{display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafbfc)}
.rm-modal-h h3{margin:0;font-size:13.5px;font-weight:650}
.rm-modal-b{padding:14px 16px}
.rm-modal-f{display:flex;justify-content:flex-end;gap:8px;padding:11px 16px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafbfc)}
.rm-check{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;user-select:none}
.rm-check input{accent-color:var(--dsw-alias-brand-primary,#2f6fde);margin:0}
.rm-sec-chips{display:flex;flex-wrap:wrap;gap:6px}
.rm-chip{appearance:none;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);border-radius:999px;padding:2px 10px;font:inherit;font-size:11.5px;cursor:pointer}
.rm-chip.is-on{border-color:var(--dsw-alias-brand-primary,#2f6fde);color:var(--dsw-alias-brand-primary,#2f6fde);background:rgba(47,111,222,.08)}
.rm-split{display:flex;gap:10px;align-items:flex-end}
.rm-split>.rm-field{flex:1 1 auto}
.rm-hint{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);line-height:1.5}
.rm-link{color:var(--dsw-alias-brand-primary,#2f6fde);cursor:pointer;text-decoration:none}
.rm-loading{padding:40px;text-align:center;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12.5px}
.rm-resume-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fafbfc)}
.rm-resume-row.is-current{border-color:var(--dsw-alias-brand-primary,#2f6fde);background:rgba(47,111,222,.06)}
.rm-resume-row.is-trash{opacity:.82}
.rm-resume-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 auto}
.rm-resume-title{font-size:12.5px;font-weight:620;color:var(--dsw-alias-label-primary,#111827);display:flex;align-items:center;gap:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rm-resume-title-input{max-width:300px;font-weight:620}
.rm-resume-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}
.rm-resume-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}
.rm-modal-wide{width:min(640px,100%)}
.rm-rev-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:9px}
.rm-path{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;word-break:break-all;background:var(--dsw-alias-bg-layer-2,#f3f4f6);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:8px;padding:8px 10px;color:var(--dsw-alias-label-primary,#111827);user-select:text}
.rm-path-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.rm-menu-wrap{position:relative;display:inline-flex}
.rm-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:40;min-width:158px;padding:5px;display:flex;flex-direction:column;gap:2px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l2,#d5d9e0);border-radius:10px;box-shadow:0 10px 26px rgba(15,23,42,.18)}
.rm-menu-item{display:block;width:100%;text-align:left;padding:7px 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary,#111827);font-size:12.5px;cursor:pointer}
.rm-menu-item:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.rm-photo-edit{display:flex;gap:12px;align-items:flex-start;margin-top:12px;padding-top:12px;border-top:1px dashed var(--dsw-alias-border-l1,#e5e7eb)}
.rm-photo-thumb{width:64px;height:64px;flex:0 0 auto;border-radius:10px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2,#d5d9e0);background:var(--dsw-alias-bg-layer-2,#f3f4f6);display:flex;align-items:center;justify-content:center;font-size:10.5px;color:var(--dsw-alias-label-secondary,#6b7280);text-align:center}
.rm-photo-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.rm-photo-thumb.is-empty{border-style:dashed}
.rm-photo-meta{display:flex;flex-direction:column;gap:8px;min-width:0;flex:1 1 auto}
.rm-row-wrap{flex-wrap:wrap;gap:6px;align-items:center}
.rm-toggle-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rm-toggle-k{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);min-width:52px}
.rm-mini.is-on{background:var(--dsw-alias-brand-primary,#2f6fde);border-color:var(--dsw-alias-brand-primary,#2f6fde);color:var(--dsw-alias-bg-base,#fff)}
.rm-order-list{display:flex;flex-direction:column;gap:4px}
.rm-order-row{position:relative;display:flex;align-items:center;gap:7px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fafbfc);transition:background .12s ease,border-color .12s ease,opacity .12s ease}
.rm-order-row.is-dragging{opacity:.45;border-style:dashed}
.rm-order-row.is-hidden{background:transparent;border-style:dashed;opacity:.6}
.rm-order-row.is-hidden .rm-order-name{color:var(--dsw-alias-label-secondary,#8b929c);font-weight:400}
.rm-order-row.is-drop-above::before,.rm-order-row.is-drop-below::after{content:"";position:absolute;left:2px;right:2px;height:2px;border-radius:2px;background:var(--dsw-alias-brand-primary,#2f6fde)}
.rm-order-row.is-drop-above::before{top:-3px}
.rm-order-row.is-drop-below::after{bottom:-3px}
.rm-order-grip{flex:0 0 auto;cursor:grab;user-select:none;color:var(--dsw-alias-label-secondary,#9aa1ab);font-size:12px;line-height:1;padding:0 1px}
.rm-order-grip:active{cursor:grabbing;color:var(--dsw-alias-brand-primary,#2f6fde)}
.rm-order-row.is-hidden .rm-order-grip{cursor:default}
.rm-order-idx{flex:0 0 14px;font-size:10.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#8b929c);text-align:right}
.rm-order-name{flex:1 1 auto;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,#111827);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rm-order-tip{margin-top:6px;font-size:10.5px}
.rm-mini-xs{width:20px;height:20px;font-size:10px;border-radius:5px}
.rm-order-eye{font-size:11px}
.rm-order-eye.is-on{background:transparent;border-color:var(--dsw-alias-border-l2,#cbd5e1);color:var(--dsw-alias-label-secondary,#6b7280)}
.rm-order-hidden{margin-top:10px;align-items:center}
.rm-text-danger{color:var(--dsw-alias-state-error-primary,#d93025)}
.rm-seg{display:inline-flex;padding:2px;gap:2px;border:1px solid var(--dsw-alias-border-l2,#d5d9e0);border-radius:9px;background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.rm-seg-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;padding:5px 10px;border-radius:7px;cursor:pointer}
.rm-seg-btn.is-on{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111827);font-weight:600;box-shadow:0 1px 2px rgba(15,23,42,.12)}
.rm-pub-json{width:100%;min-height:180px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre;overflow:auto;resize:vertical;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-primary,#111827)}
.rm-lib{display:flex;flex-direction:column;width:100%;min-height:0}
.rm-lib-bar{display:flex;align-items:center;gap:10px;padding:12px 18px 0;flex-wrap:wrap}
.rm-lib-bar h3{margin:0;font-size:13px;font-weight:650}
.rm-lib-bar .rm-row{margin-left:auto;gap:6px}
.rm-lib .rm-grid{padding-top:12px}
.rm-tpl-editor-card{width:min(960px,100%);max-height:min(88vh,860px);display:flex;flex-direction:column}
.rm-tpl-editor-body{display:grid;grid-template-columns:minmax(320px,.92fr) minmax(300px,1.08fr);gap:14px;padding:12px 14px;overflow:auto;min-height:0}
@media (max-width:900px){.rm-tpl-editor-body{grid-template-columns:1fr}}
.rm-tpl-editor-form{min-width:0;display:flex;flex-direction:column}
.rm-tpl-preview{position:sticky;top:0;align-self:flex-start;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fafbfc);padding:10px;display:flex;flex-direction:column;align-items:center;gap:7px;min-width:0}
.rm-tpl-preview .rm-scaled{box-shadow:0 6px 18px rgba(15,23,42,.14)}
.rm-color-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 12px}
.rm-color-field{display:flex;flex-direction:column;gap:3px;min-width:0}
.rm-color-input{width:30px;height:23px;padding:0;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:6px;background:transparent;cursor:pointer;flex:0 0 auto}
.rm-color-val{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10.5px;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap}
.rm-range-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 12px}
.rm-range-field{display:flex;flex-direction:column;gap:3px;min-width:0}
.rm-range-k{display:flex;justify-content:space-between;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}
.rm-range-k b{font-weight:600;color:var(--dsw-alias-label-primary,#1d2129);font-variant-numeric:tabular-nums}
.rm-range{width:100%;accent-color:var(--dsw-alias-brand-primary,#2f6fde)}
.rm-swatch-row{display:flex;gap:8px;flex-wrap:wrap}
.rm-swatch{display:flex;flex-direction:column;gap:3px;align-items:center;font-size:10px;color:var(--dsw-alias-label-secondary,#6b7280);min-width:52px}
.rm-swatch-chip{width:34px;height:25px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2,#d5d9e0);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.rm-tpl-preview-dialog{width:min(720px,100%)}
`;

function rmInjectCss() {
  // 每个面板实例注入一次即可；重复注入同一段 CSS 无副作用。
  return h('style', { key: 'rm-css' }, RM_CSS);
}
