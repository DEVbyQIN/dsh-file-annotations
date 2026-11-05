// dsh-file-annotations — browser half.
//
// Review comments from the right file preview are collected above the current
// Session's native composer. Its normal Send/Enter pipeline serializes one
// reference chip, and Host admission moves that immutable batch into history.
//
// Hard constraints from the DSH plugin contract (each one bit somebody before):
//   1. Top level only registers the factory (lazy CJS); side effects live in apply().
//   2. `id` must equal package.json `name`.
//   3. Flat exports: `exports.apply` / `exports.inject`. No `export default`
//      (the loader's unwrapExports would silently drop `inject`).
//   4. Our own <style> carries data-plugin / data-plugin-css.
//   5. Only stable DOM hooks: slot outlet attributes, data-* we own. Never
//      build-hashed class names.
//   6. Floating surfaces in the desktop app need `-webkit-app-region: no-drag`.
//   7. Composer integration uses the public conversation input facade and
//      input-trigger reference codec, never by poking the Lexical DOM.
//   8. dispose() removes every listener, timer, style tag, floating node and the
//      debug global.

window.__ModuleLoader__.load({
  id: 'dsh-file-annotations',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require('react');

    // ======================================================================
    // 一、常量
    // ======================================================================

    var PKG = 'dsh-file-annotations';
    var VERSION = '0.6.0';
    var STYLE_TAG_ID = PKG + '/style';
    var GLOBAL_KEY = '__dshFileAnnotations';
    var LS_PREFIX = 'dsh.file-annotations.v1:';
    var PDF_BOX_PREF = 'dsh.file-annotations.pdf-box-default.v1';

    /** All of our DOM carries this attribute; the value names the role. */
    var MARK = 'data-dsh-file-annotations';

    var RESOLVE_ROUTE = 'api/dsh-file-annotations/resolve';
    var CROP_ROUTE = 'api/dsh-file-annotations/crop';
    var READ_ROUTE = 'api/dsh-file-annotations/read';
    var WRITE_ROUTE = 'api/dsh-file-annotations/write';

    /** Hidden anchor: a conversation-scope slot that hands us `inputActions`. */
    var SLOT_BRIDGE = 'conversation.input.overlay';
    var SLOT_PENDING = 'conversation.input.dock';
    var REF_PREFIX = 'dsh-notes-';
    /** Right Sidebar action slots (both session-scoped). */
    var SLOT_FILES_ACTIONS = 'sidebar.right.tab.files.actions';
    var SLOT_DOC_ACTIONS = 'sidebar.right.tab.document.actions';
    /** Slot outlet attribute the renderer emits; used to scope text selection. */
    var SIDEBAR_PANE_SELECTOR = '[data-slot="sidebar.right.pane.tab"]';

    var PANEL_WIDTH = 344;
    var MAX_QUOTE = 2000;

    var STRINGS = {
      zh: {
        actionNote: '批注',
        actionNotes: '批注 {n}',
        panelTitle: '批注历史',
        pendingTitle: '待发送批注 · {n}',
        pendingHint: '与下方消息一起发送',
        pendingSending: '正在提交…',
        pendingFailed: '提交未成功，批注已保留，可重新发送。',
        pendingUnavailable: '输入框尚未准备好，批注已保留。',
        pendingBusy: '批注正在提交，请稍后再试。',
        pendingEmpty: '这组批注已发送或移除，请重新确认消息。',
        finishEdit: '请先保存或取消正在编辑的批注，再发送消息。',
        noteReference: '文件批注',
        edit: '编辑',
        locate: '定位原文',
        removePending: '移除待发送批注',
        adopt: '移到本会话',
        requeue: '加入待发送',
        selectElement: '选择网页元素',
        moreTools: '更多批注工具',
        boxRegion: '框选区域',
        pdfSettings: 'PDF 批注设置',
        pdfDefaultBox: '打开 PDF 时默认框选',
        settingsFailed: '设置未能保存，请重试。',
        closedNotes: '已清除 {n} 条批注',
        undoClose: '撤销',
        undoCloseHint: '10 秒内恢复刚清除的批注',
        closeRetry: '清理尚未保存，连接恢复后会重试。',
        elementHint: '点击要批注的网页元素',
        htmlElement: '网页元素',
        htmlRegion: '网页区域',
        panelCount: '{n} 条 · 未发送 {m}',
        empty: '暂无批注',
        composePlaceholder: '写下批注',
        composeWholeFile: '整个文件',
        save: '保存批注',
        send: '发给 AI 继续完善',
        sent: '已发送 {n} 条',
        sendFailed: '发不出去：输入框没准备好，批注已保留。',
        saved: '已保存批注',
        noWorkspace: '还没拿到这个会话的工作区，稍等一下再点。',
        regionMode: '框选',
        regionModeOn: '退出框选',
        regionHint: '按住拖出一个矩形',
        regionPage: '第 {n} 页',
        regionFrame: '视口区域',
        regionOnly: '这个预览不支持框选（只有 PDF / 图片 / HTML 可以）',
        inlineSave: '保存',
        inlineCancel: '取消',
        inlinePlaceholder: '写下批注',
        saveHint: 'Enter 保存；{keys} 保存并发送全部批注',
        submitNotes: '发送全部批注',
        saveAndSend: '保存并发送全部批注',
        annotateSelection: '批注选中文字',
        ownerOther: '其他会话',
        ownerUnknown: '历史（未归属）',
        scopeSession: '本会话',
        scopeAll: '全部会话',
        remove: '删除',
        close: '关闭',
        sentTag: '已发送',
        quoteTag: '选中的文字',
        regionTagPage: '区域 · 第 {n} 页',
        regionTagImage: '区域 · 图片',
        regionTagFrame: '区域 · 视口',
        fileTag: '整文件',
        noComment: '（没有写评论）'
      },
      en: {
        actionNote: 'Note',
        actionNotes: 'Notes {n}',
        panelTitle: 'Note history',
        pendingTitle: 'Pending notes · {n}',
        pendingHint: 'Send together with your message below',
        pendingSending: 'Submitting…',
        pendingFailed: 'Submission failed. Your notes are kept and can be sent again.',
        pendingUnavailable: 'The composer is not ready. Your notes are kept.',
        pendingBusy: 'These notes are being submitted. Please wait.',
        pendingEmpty: 'These notes were sent or removed. Review your message again.',
        finishEdit: 'Save or cancel the note being edited before sending.',
        noteReference: 'File notes',
        edit: 'Edit',
        locate: 'Show in file',
        removePending: 'Remove pending note',
        adopt: 'Move to this chat',
        requeue: 'Add to message',
        selectElement: 'Select webpage element',
        moreTools: 'More annotation tools',
        boxRegion: 'Box a region',
        pdfSettings: 'PDF annotation settings',
        pdfDefaultBox: 'Enable box selection when opening PDFs',
        settingsFailed: 'Could not save the setting. Please try again.',
        closedNotes: 'Cleared {n} notes',
        undoClose: 'Undo',
        undoCloseHint: 'Restore cleared notes within 10 seconds',
        closeRetry: 'Cleanup is not saved yet. Retrying when the connection recovers.',
        elementHint: 'Click the webpage element to annotate',
        htmlElement: 'Webpage element',
        htmlRegion: 'Webpage region',
        panelCount: '{n} notes · {m} unsent',
        empty: 'No notes',
        composePlaceholder: 'Write a note',
        composeWholeFile: 'the whole file',
        save: 'Save note',
        send: 'Send to the agent',
        sent: 'Sent {n}',
        sendFailed: 'Could not reach the composer. Your notes are kept.',
        saved: 'Note saved',
        noWorkspace: 'This session has no workspace yet; try again in a moment.',
        regionMode: 'Box',
        regionModeOn: 'Exit box',
        regionHint: 'Drag to box a region',
        regionPage: 'page {n}',
        regionFrame: 'viewport area',
        regionOnly: 'Boxing works on PDF / image / HTML previews only',
        inlineSave: 'Save',
        inlineCancel: 'Cancel',
        inlinePlaceholder: 'Write a note',
        saveHint: 'Enter to save; {keys} to save and send all notes',
        submitNotes: 'Send all notes',
        saveAndSend: 'Save and send all notes',
        annotateSelection: 'Annotate selected text',
        ownerOther: 'other session',
        ownerUnknown: 'legacy (unassigned)',
        scopeSession: 'This session',
        scopeAll: 'All sessions',
        remove: 'Delete',
        close: 'Close',
        sentTag: 'sent',
        quoteTag: 'selected text',
        regionTagPage: 'region · page {n}',
        regionTagImage: 'region · image',
        regionTagFrame: 'region · viewport',
        fileTag: 'whole file',
        noComment: '(no comment)'
      }
    };

    var CSS = [
      // Never give a viewport-sized visual layer a no-drag region: Electron
      // otherwise loses the title bar's native window-drag hit target.
      '[' + MARK + '="panel"],[' + MARK + '="inline"],[' + MARK + '="pop"],[' + MARK + '="mark"],[' + MARK + '="action"],[' + MARK + '="capture"],[' + MARK + '="pending"]{-webkit-app-region:no-drag;}',
      '[' + MARK + '="marks"]{-webkit-app-region:initial!important;}',
      ':root{--dsh-annotation-surface:#fff;--dsh-annotation-hover:#f0f3f9;}',
      'body[data-ds-dark-theme]{--dsh-annotation-surface:#292d34;--dsh-annotation-hover:#3a414d;}',
      '[' + MARK + '="action"]{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 7px;',
      'border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-text-secondary,#4b4f56);',
      'font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;}',
      '[' + MARK + '="action"]:hover{background:var(--dsw-alias-bg-fill-2,rgba(0,0,0,.06));',
      'color:var(--dsw-alias-text-primary,#1b1c1e);}',
      '[' + MARK + '="action"][data-has="1"]{color:var(--dsw-alias-state-business-primary,#4176e6);}',
      '[' + MARK + '="action"][aria-pressed="true"],[' + MARK + '="action"][data-active="1"]{color:var(--dsw-alias-state-business-primary,#4176e6);',
      'background:var(--dsw-alias-state-business-primary-bg,rgba(65,118,230,.12));}',
      '[' + MARK + '="action"][data-tool-icon]{width:28px;padding:0;justify-content:center;}',
      '[data-dsh-annotation-pdf-box] [data-pdf-page],[data-dsh-annotation-pdf-box] [data-pdf-page] *{cursor:crosshair!important;}',
      '[' + MARK + '="htmlTools"]{display:inline-flex;gap:1px;}',
      '[' + MARK + '="toolMenu"]{position:fixed;z-index:2147482002;min-width:132px;padding:4px;border-radius:8px;',
      'border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.12));background:var(--dsh-annotation-surface,#fff);',
      'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.16));-webkit-app-region:no-drag;}',
      '[' + MARK + '="toolMenu"] button{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 9px;border:0;',
      'border-radius:5px;background:transparent;color:var(--dsw-alias-text-primary,#1b1c1e);font:inherit;font-size:12px;cursor:pointer;}',
      '[' + MARK + '="toolMenu"] button:hover,[' + MARK + '="toolMenu"] button:focus-visible{background:var(--dsh-annotation-hover,#f0f3f9);}',
      '[' + MARK + '="toolMenu"] [role="menuitemcheckbox"]::before{content:"";width:12px;flex:none;}',
      '[' + MARK + '="toolMenu"] [aria-checked="true"]::before{content:"✓";color:var(--dsw-alias-state-business-primary,#4176e6);}',
      '[' + MARK + '="undoNotice"]{position:fixed;right:24px;bottom:24px;z-index:2147482010;display:flex;align-items:center;gap:12px;',
      'padding:10px 14px;border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.12));border-radius:10px;',
      'background:var(--dsh-annotation-surface,#fff);color:var(--dsw-alias-text-primary,#1b1c1e);font-size:13px;',
      'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.16));-webkit-app-region:no-drag;}',
      '[' + MARK + '="panel"]{position:fixed;z-index:2147482000;display:flex;flex-direction:column;',
      'width:' + PANEL_WIDTH + 'px;max-height:min(70vh,560px);border-radius:12px;overflow:hidden;',
      'background:var(--dsw-alias-bg-layer-1,#fff);',
      'background-image:linear-gradient(var(--dsw-specific-menu,rgba(248,249,250,.58)),var(--dsw-specific-menu,rgba(248,249,250,.58)));',
      'border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.09));',
      'box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.18));',
      'color:var(--dsw-alias-text-primary,#1b1c1e);font-size:12.5px;line-height:1.5;}',
      '[' + MARK + '="head"]{display:flex;align-items:center;gap:8px;padding:10px 12px;',
      'border-bottom:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.07));}',
      '[' + MARK + '="title"]{font-weight:600;font-size:13px;}',
      '[' + MARK + '="sub"]{color:var(--dsw-alias-text-tertiary,#8a8f98);font-size:11.5px;}',
      '[' + MARK + '="grow"]{flex:1 1 auto;}',
      '[' + MARK + '="iconbtn"]{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;',
      'border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-text-tertiary,#8a8f98);',
      'font-size:14px;line-height:1;cursor:pointer;}',
      '[' + MARK + '="iconbtn"]:hover{background:var(--dsw-alias-bg-fill-2,rgba(0,0,0,.06));',
      'color:var(--dsw-alias-text-primary,#1b1c1e);}',
      '[' + MARK + '="list"]{flex:1 1 auto;overflow:auto;padding:6px 8px 2px;}',
      '[' + MARK + '="group"]{padding:4px 4px 6px;}',
      '[' + MARK + '="filebar"]{display:flex;align-items:center;gap:6px;padding:6px 4px 4px;',
      'color:var(--dsw-alias-text-tertiary,#8a8f98);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);',
      'font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '[' + MARK + '="item"]{position:relative;margin:3px 0;padding:7px 30px 7px 9px;border-radius:8px;',
      'background:var(--dsw-alias-bg-fill-1,rgba(0,0,0,.035));}',
      '[' + MARK + '="item"][data-sent="1"]{opacity:.62;}',
      '[' + MARK + '="quote"]{display:block;margin-bottom:3px;padding-left:6px;',
      'border-left:2px solid var(--dsw-alias-border-2,rgba(0,0,0,.16));',
      'color:var(--dsw-alias-text-secondary,#4b4f56);font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);',
      'font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:54px;overflow:hidden;}',
      '[' + MARK + '="comment"]{display:block;white-space:pre-wrap;overflow-wrap:anywhere;}',
      '[' + MARK + '="tag"]{display:inline-block;margin-left:6px;padding:0 5px;border-radius:5px;',
      'background:var(--dsw-alias-bg-fill-3,rgba(0,0,0,.07));color:var(--dsw-alias-text-tertiary,#8a8f98);font-size:10px;}',
      '[' + MARK + '="del"]{position:absolute;top:4px;right:4px;width:20px;height:20px;border:0;border-radius:5px;',
      'background:transparent;color:var(--dsw-alias-text-tertiary,#8a8f98);cursor:pointer;line-height:1;font-size:13px;}',
      '[' + MARK + '="del"]:hover{background:var(--dsw-alias-bg-fill-2,rgba(0,0,0,.08));color:var(--dsw-alias-text-primary,#1b1c1e);}',
      '[' + MARK + '="compose"]{border-top:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.07));padding:8px 10px 10px;}',
      '[' + MARK + '="target"]{display:block;margin:2px 0 5px;color:var(--dsw-alias-text-tertiary,#8a8f98);',
      'font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:10.5px;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;}',
      '[' + MARK + '="textarea"]{display:block;width:100%;box-sizing:border-box;min-height:62px;max-height:160px;',
      'resize:vertical;padding:7px 8px;border-radius:8px;font:inherit;font-size:12.5px;',
      'border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.12));',
      'background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-text-primary,#1b1c1e);outline:none;}',
      '[' + MARK + '="textarea"]:focus{border-color:var(--dsw-alias-state-business-primary,#4176e6);}',
      '[' + MARK + '="foot"]{display:flex;align-items:center;gap:8px;margin-top:8px;}',
      '[' + MARK + '="primary"]{flex:1 1 auto;height:30px;border:0;border-radius:8px;',
      'background:var(--dsw-alias-state-business-primary,#4176e6);color:#fff;font:inherit;font-size:12.5px;',
      'font-weight:600;cursor:pointer;}',
      '[' + MARK + '="primary"][disabled]{opacity:.45;cursor:default;}',
      '[' + MARK + '="ghost"]{height:30px;padding:0 10px;border-radius:8px;font:inherit;font-size:12px;',
      'border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.12));background:transparent;',
      'color:var(--dsw-alias-text-secondary,#4b4f56);cursor:pointer;}',
      '[' + MARK + '="ghost"]:hover{background:var(--dsw-alias-bg-fill-2,rgba(0,0,0,.05));}',
      '[' + MARK + '="flash"]{position:fixed;z-index:2147482001;padding:6px 10px;border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.1));',
      'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.16));font-size:12px;',
      'color:var(--dsw-alias-text-primary,#1b1c1e);}',
      '[' + MARK + '="pop"]{position:fixed;z-index:2147482000;display:inline-flex;align-items:center;gap:4px;',
      'height:26px;padding:0 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.1));',
      'background:var(--dsh-annotation-surface,#fff);color:var(--dsw-alias-text-primary,#1b1c1e);',
      'font:inherit;font-size:12px;cursor:pointer;box-shadow:var(--dsw-elevation-prominent,0 6px 20px rgba(0,0,0,.16));}',
      '[' + MARK + '="pop"]:hover{background:var(--dsh-annotation-hover,#f0f3f9);}',
      '[' + MARK + '="pop"] kbd{margin-left:5px;font:inherit;font-size:10px;opacity:.75;}',
      '[' + MARK + '="selectionTools"]{position:fixed;z-index:2147482000;display:inline-flex;align-items:center;',
      'height:30px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.1));border-radius:7px;',
      'background:var(--dsh-annotation-surface,#fff);box-shadow:var(--dsw-elevation-prominent,0 6px 20px rgba(0,0,0,.16));-webkit-app-region:no-drag;}',
      '[' + MARK + '="selectionTools"] [' + MARK + '="pop"]{position:static;height:28px;border:0;box-shadow:none;border-radius:6px 0 0 6px;}',
      '[data-dsh-file-annotations-peer="selection"]{position:fixed!important;z-index:2147482001!important;',
      'left:var(--dsh-note-peer-left)!important;top:var(--dsh-note-peer-top)!important;transform:none!important;margin:0!important;',
      'width:var(--dsh-note-peer-width)!important;height:28px!important;min-height:0!important;box-sizing:border-box!important;',
      'padding:0 9px!important;border:0!important;border-left:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.1))!important;',
      'border-radius:0 6px 6px 0!important;background:var(--dsh-annotation-surface,#fff)!important;',
      'color:var(--dsw-alias-text-primary,#1b1c1e)!important;font:inherit!important;font-size:12px!important;',
      'box-shadow:none!important;-webkit-app-region:no-drag;}',
      '[data-dsh-file-annotations-peer="selection"]:hover{background:var(--dsh-annotation-hover,#f0f3f9)!important;}',
      '[' + MARK + '="marks"]{position:fixed;inset:0;z-index:2147481900;pointer-events:none;}',
      '[' + MARK + '="mark"]{position:fixed;pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;',
      'min-width:19px;height:19px;padding:0 5px;border:0;border-radius:10px;',
      'background:var(--dsw-alias-state-business-primary,#4176e6);color:#fff;font:inherit;font-size:10.5px;',
      'font-weight:700;line-height:1;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.22);}',
      '[' + MARK + '="mark"][data-sent="1"]{background:var(--dsw-alias-bg-fill-3,#9aa0a6);}',
      '[' + MARK + '="marktip"]{position:fixed;z-index:2147481950;max-width:250px;padding:7px 9px;border-radius:8px;',
      'background:var(--dsh-annotation-surface,#fff);border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.1));',
      'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.16));font-size:12px;line-height:1.45;',
      'color:var(--dsw-alias-text-primary,#1b1c1e);pointer-events:none;}',
      '[' + MARK + '="inline"]{position:fixed;z-index:2147482005;width:248px;padding:8px;border-radius:10px;',
      'background:var(--dsh-annotation-surface,#fff);border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.1));',
      'box-shadow:var(--dsw-elevation-prominent,0 12px 30px rgba(0,0,0,.2));}',
      '[' + MARK + '="inlineQuote"]{display:block;margin-bottom:6px;padding-left:6px;',
      'border-left:2px solid var(--dsw-alias-border-2,rgba(0,0,0,.16));color:var(--dsw-alias-text-tertiary,#8a8f98);',
      'font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:10.5px;white-space:pre-wrap;',
      'max-height:34px;overflow:hidden;overflow-wrap:anywhere;}',
      '[' + MARK + '="inlineInput"]{display:block;width:100%;box-sizing:border-box;height:28px;padding:0 7px;',
      'border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.14));border-radius:7px;font:inherit;font-size:12px;',
      'background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-text-primary,#1b1c1e);outline:none;}',
      '[' + MARK + '="inlineInput"]:focus{border-color:var(--dsw-alias-state-business-primary,#4176e6);}',
      '[' + MARK + '="inlineRow"]{display:flex;gap:6px;margin-top:6px;}',
      '[' + MARK + '="inlineRow"]>button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;',
      'flex:0 0 64px;height:30px;padding:0 10px;border-radius:7px;font:inherit;font-size:12px;line-height:1;}',
      '[' + MARK + '="inlineSave"]{border:1px solid #4176e6;background:#4176e6;color:#fff;cursor:pointer;}',
      '[' + MARK + '="inlineSave"]:hover{background:#3264cf;border-color:#3264cf;}',
      '[' + MARK + '="scope"]{height:22px;padding:0 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-1,rgba(0,0,0,.12));',
      'background:transparent;color:var(--dsw-alias-text-secondary,#4b4f56);font:inherit;font-size:11px;cursor:pointer;}',
      '[' + MARK + '="scope"]:hover{background:var(--dsw-alias-bg-fill-2,rgba(0,0,0,.05));}',
      '[' + MARK + '="capture"]{position:fixed;z-index:2147481940;cursor:crosshair;background:transparent;touch-action:none;user-select:none;}',
      '[' + MARK + '="captureHint"]{position:fixed;z-index:2147481941;padding:5px 9px;border-radius:7px;pointer-events:none;',
      'background:var(--dsw-alias-state-business-primary,#4176e6);color:#fff;font-size:11px;',
      'box-shadow:0 4px 14px rgba(0,0,0,.2);}',
      '[' + MARK + '="regionSel"]{position:fixed;z-index:2147481942;pointer-events:none;border:1.5px dashed var(--dsw-alias-state-business-primary,#4176e6);',
      'background:rgba(65,118,230,.14);border-radius:3px;}',
      '[' + MARK + '="regionBox"]{position:fixed;z-index:2147481890;pointer-events:none;box-sizing:border-box;border:1.2px solid rgba(65,118,230,.65);',
      'background:rgba(65,118,230,.12);border-radius:3px;}',
      '[' + MARK + '="textHighlight"]{position:fixed;z-index:2147481890;pointer-events:none;box-sizing:border-box;background:rgba(65,118,230,.16);border-bottom:1px solid rgba(65,118,230,.6);}',
      '[' + MARK + '="draftRegion"]{position:fixed;z-index:2147481942;pointer-events:none;box-sizing:border-box;',
      'border:2px dashed #4176e6;background:rgba(65,118,230,.14);border-radius:3px;}',
      '[' + MARK + '="pending"]{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance,16px)*2);',
      'max-width:var(--dsh-composer-card-max-width,760px);margin:0 auto 6px;border:1px solid var(--dsw-alias-border-l1,rgba(120,120,120,.2));',
      'border-radius:12px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#fff));color:var(--dsw-alias-label-primary,#25272b);font-size:12px;}',
      '[' + MARK + '="pendingHead"]{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:9px 12px;}',
      '[' + MARK + '="pendingToggle"]{border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;text-align:left;padding:0;}',
      '[' + MARK + '="pendingHint"]{font-size:11px;color:var(--dsw-alias-label-tertiary,#7c8189);margin-left:auto;}',
      '[' + MARK + '="submitNotes"]{flex:none;border:0;border-radius:6px;padding:4px 7px;background:var(--dsh-annotation-hover,#f0f3f9);',
      'color:var(--dsw-alias-state-business-primary,#4176e6);font:inherit;font-size:11px;cursor:pointer;}',
      '[' + MARK + '="submitNotes"]:disabled{opacity:.45;cursor:default;}',
      '[' + MARK + '="pendingList"]{max-height:240px;overflow:auto;padding:0 10px 8px;}',
      '[' + MARK + '="pendingItem"]{padding:9px 2px;border-top:1px solid var(--dsw-alias-border-l1,rgba(120,120,120,.16));}',
      '[' + MARK + '="pendingFile"]{display:flex;align-items:center;gap:7px;min-width:0;}',
      '[' + MARK + '="pendingPath"]{flex:1;min-width:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#5a616b);',
      'font:inherit;font-size:11px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;padding:0;}',
      '[' + MARK + '="pendingButton"]{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#7c8189);font:inherit;font-size:11px;cursor:pointer;padding:3px 5px;}',
      '[' + MARK + '="pendingButton"]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(120,120,120,.1));border-radius:5px;}',
      '[' + MARK + '="pendingButton"]:disabled{opacity:.4;cursor:default;}',
      '[' + MARK + '="pendingBody"]{display:flex;gap:9px;margin-top:5px;}',
      '[' + MARK + '="pendingThumb"]{object-fit:contain;width:64px;height:44px;border-radius:5px;flex:none;background:var(--dsw-alias-interactive-bg-hover,rgba(120,120,120,.1));}',
      '[' + MARK + '="pendingText"]{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;}',
      '[' + MARK + '="pendingQuote"]{color:var(--dsw-alias-label-tertiary,#7c8189);font-size:11px;white-space:pre-wrap;',
      'max-height:42px;overflow:hidden;border-left:2px solid var(--dsw-alias-border-l2,rgba(120,120,120,.25));padding-left:7px;margin-bottom:4px;}',
      '[' + MARK + '="pendingEdit"]{box-sizing:border-box;width:100%;min-height:52px;resize:vertical;border:1px solid var(--dsw-alias-border-l2,rgba(120,120,120,.3));',
      'border-radius:6px;padding:6px;font:inherit;background:var(--dsw-alias-bg-base,#fff);color:inherit;}',
      '[' + MARK + '="pendingError"]{padding:0 12px 9px;color:var(--dsw-alias-state-error-label,#bd4141);line-height:1.5;}',
      '[data-annotation-preview]{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;height:100%;}',
      '[' + MARK + '="viewerTools"]{display:flex;justify-content:flex-end;gap:4px;padding:3px 8px;flex:none;-webkit-app-region:no-drag;}',
      '[data-annotation-text]{box-sizing:border-box;flex:1;min-height:0;margin:0;padding:18px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.7;user-select:text;}'
    ].join('\n');

    // ======================================================================
    // 二、状态
    // ======================================================================

    /** workspace cwd -> annotation[] (the single source the panel renders). */
    var byCwd = Object.create(null);
    /** cwd -> 'idle' | 'loading' | 'ready' | 'offline'. */
    var loadState = Object.create(null);
    var listeners = new Set();
    var saveTimers = Object.create(null);

    /** What the right Sidebar currently shows; set by the slot components. */
    var view = { cwd: null, sessionId: null, file: null, rel: null };
    /** One bridge per conversation occurrence: { sessionId, inputActions, el }. */
    var bridges = [];

    var panelEl = null;
    var panelParts = null;
    var panelOpen = false;

    var flashTimer = null;
    var flashEl = null;
    var composing = { quote: '', path: null, rel: null };
    /** 'session' (default) or 'all'; two sessions in one workspace no longer share a view. */
    var scope = 'session';
    var installed = false;
    var composerRuntime = null;
    var composerEntries = new Map();
    var composerFlights = new Map();
    var composerErrors = new Map();
    var cropJobs = new Map();
    var cropPreviews = new Map();
    var saveQueues = new Map();
    var loadPromises = new Map();
    var closingTargets = new Map();
    var protectedCropIds = new Map();
    var removedCropIds = new Map();
    var closeRetryTimers = new Map();
    var previewLifetimes = new Map();
    var previewPanels = new Map();
    var deferredCloses = [];
    var closeUndo = null;
    var CLOSE_UNDO_MS = 10000;
    var editingNotes = new Set();
    var runtimeDisposers = [];
    var previewObserver = null;
    var shortcutService = null;
    var selectionShortcutLabel = null;
    var selectionShortcutBinding = null;
    var htmlFrames = new Map();
    var htmlPickMode = 'box';

    function isMac() {
      return !window.navigator || /Mac|iPhone|iPad/.test(window.navigator.platform || window.navigator.userAgent || '');
    }

    function submitKeys() { return isMac() ? '⌘↵' : 'Ctrl+Enter'; }
    function selectionKeys() { return selectionShortcutLabel != null ? selectionShortcutLabel : (isMac() ? '⌘⇧E' : 'Ctrl+Shift+E'); }

    function t(key, vars) {
      var lang = currentLang();
      var table = STRINGS[lang] || STRINGS.zh;
      var text = table[key] != null ? table[key] : (STRINGS.zh[key] != null ? STRINGS.zh[key] : key);
      if (!vars) return text;
      return text.replace(/\{(\w+)\}/g, function (all, name) {
        return vars[name] != null ? String(vars[name]) : all;
      });
    }

    function currentLang() {
      try {
        var html = document.documentElement;
        var lang = html && (html.getAttribute('lang') || html.lang);
        if (typeof lang === 'string' && lang.toLowerCase().indexOf('zh') === 0) return 'zh';
        if (typeof lang === 'string' && lang) return 'en';
      } catch (err) { /* headless test DOM */ }
      return 'zh';
    }

    function subscribe(fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    }

    function bump() {
      listeners.forEach(function (fn) {
        try { fn(); } catch (err) { /* one bad subscriber must not break the rest */ }
      });
      composerEntries.forEach(scheduleReferenceSync);
      syncHtmlNotes();
    }

    // ======================================================================
    // 三、数据：校验、序列化、持久化
    // ======================================================================

    function isString(value, max) {
      return typeof value === 'string' && value !== '' && value.length <= (max || 4096);
    }

    function makeId() {
      var rnd = Math.random().toString(36).slice(2, 8);
      return 'a' + Date.now().toString(36) + rnd;
    }

    function normalizeTextAnchor(raw) {
      if (!raw || !Number.isInteger(raw.start) || !Number.isInteger(raw.end)
          || raw.start < 0 || raw.end <= raw.start || raw.end > 10000000) return null;
      var anchor = { start: raw.start, end: raw.end,
        prefix: typeof raw.prefix === 'string' ? raw.prefix.slice(-96) : '',
        suffix: typeof raw.suffix === 'string' ? raw.suffix.slice(0, 96) : '' };
      if (Number.isInteger(raw.page) && raw.page > 0) anchor.page = raw.page;
      return anchor;
    }

    function normalizeHtmlAnchor(raw) {
      if (!raw || ['text', 'element', 'region'].indexOf(raw.kind) < 0
          || typeof raw.selector !== 'string' || !raw.selector.trim() || raw.selector.length > 2048) return null;
      var result = { version: 1, kind: raw.kind, selector: raw.selector.trim(),
        tag: typeof raw.tag === 'string' ? raw.tag.slice(0, 64) : '',
        text: typeof raw.text === 'string' ? raw.text.slice(0, 256) : '' };
      if (raw.kind === 'text') {
        var textAnchor = normalizeTextAnchor(raw);
        if (!textAnchor) return null;
        Object.assign(result, textAnchor);
      }
      return result;
    }

    /** Clamp a region to the page/image box; bad input simply has no region. */
    function normalizeRegionInput(raw) {
      if (!raw || typeof raw !== 'object') return null;
      var kind = raw.kind === 'pdf' ? 'pdf' : raw.kind === 'image' ? 'image' : raw.kind === 'html' ? 'html' : null;
      if (!kind) return null;
      var num = function (value) {
        return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
      };
      var x = num(raw.x);
      var y = num(raw.y);
      var w = num(raw.w);
      var h = num(raw.h);
      if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null;
      var region = { kind: kind, x: x, y: y, w: w, h: h };
      if (kind !== 'image') region.page = Number.isFinite(raw.page) ? Math.max(1, Math.floor(raw.page)) : 1;
      return region;
    }

    /** One client-side record; the host half re-validates everything. */
    function makeRecord(input) {
      if (!input || !isString(input.path)) return null;
      var comment = typeof input.comment === 'string' ? input.comment.trim() : '';
      var quote = typeof input.quote === 'string' ? input.quote.trim() : '';
      if (comment === '' && quote === '') return null;
      if (quote.length > MAX_QUOTE) quote = quote.slice(0, MAX_QUOTE);
      var record = {
        id: makeId(),
        path: input.path,
        rel: typeof input.rel === 'string' ? input.rel : '',
        sessionId: typeof input.sessionId === 'string' ? input.sessionId : (view.sessionId || ''),
        quote: quote,
        comment: comment,
        createdAt: Date.now()
      };
      var region = normalizeRegionInput(input.region);
      if (region) record.region = region;
      var anchor = normalizeTextAnchor(input.anchor);
      if (anchor) record.anchor = anchor;
      var htmlAnchor = normalizeHtmlAnchor(input.htmlAnchor);
      if (htmlAnchor) record.htmlAnchor = htmlAnchor;
      return record;
    }

    /** Plain-object copy, dropping anything the host would refuse. */
    function serializeList(list) {
      var out = [];
      if (!Array.isArray(list)) return out;
      for (var i = 0; i < list.length; i += 1) {
        var item = list[i];
        if (!item || !isString(item.id) || !isString(item.path)) continue;
        var record = {
          id: item.id,
          path: item.path,
          rel: typeof item.rel === 'string' ? item.rel : '',
          // v1 notes have no Session; they stay readable and land in "全部会话".
          sessionId: typeof item.sessionId === 'string' ? item.sessionId : '',
          quote: typeof item.quote === 'string' ? item.quote : '',
          comment: typeof item.comment === 'string' ? item.comment : '',
          createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now()
        };
        if (Number.isFinite(item.sentAt)) record.sentAt = item.sentAt;
        if (item.detached === true) record.detached = true;
        var region = normalizeRegionInput(item.region);
        if (region) record.region = region;
        var anchor = normalizeTextAnchor(item.anchor);
        if (anchor) record.anchor = anchor;
        var htmlAnchor = normalizeHtmlAnchor(item.htmlAnchor);
        if (htmlAnchor) record.htmlAnchor = htmlAnchor;
        if (typeof item.crop === 'string' && item.crop) record.crop = item.crop;
        out.push(record);
      }
      return out;
    }

    /** Parse an unknown payload into a clean list (bad entries are dropped). */
    function parseList(raw) {
      var data;
      if (typeof raw === 'string') {
        try { data = JSON.parse(raw); } catch (err) { return []; }
      } else {
        data = raw;
      }
      var list = data && Array.isArray(data.annotations) ? data.annotations : (Array.isArray(data) ? data : []);
      return serializeList(list);
    }

    function itemsOf(cwd) {
      if (!cwd) return [];
      return byCwd[cwd] || (byCwd[cwd] = []);
    }

    function setItems(cwd, list) {
      byCwd[cwd] = serializeList(list);
      bump();
      syncMarkers();
      return byCwd[cwd];
    }

    function localStore() {
      try {
        return window.localStorage || null;
      } catch (err) {
        return null;
      }
    }

    function pdfAutoBox() {
      var store = localStore();
      try { return !!store && store.getItem(PDF_BOX_PREF) === '1'; } catch (error) { return false; }
    }

    function setPdfAutoBox(next) {
      var store = localStore();
      try { if (!store) throw new Error('storage-unavailable'); store.setItem(PDF_BOX_PREF, next ? '1' : '0'); }
      catch (error) { flash(t('settingsFailed')); return false; }
      bump();
      if (previewKind() === 'pdf' && (!inlineEl || !next)) setRegionMode(next === true);
      return true;
    }

    // Once per visible PDF visit: Esc/manual-off must not be undone by scroll,
    // lazy page renders, annotation saves or other observer notifications.
    var pdfDefaultVisit = null;
    function maybeApplyPdfDefault() {
      var pane = paneElement();
      if (!pane || !view.file || previewKind() !== 'pdf') { pdfDefaultVisit = null; return; }
      if (pdfDefaultVisit && pdfDefaultVisit.pane === pane && pdfDefaultVisit.file === view.file && pdfDefaultVisit.sessionId === view.sessionId) return;
      pdfDefaultVisit = { pane: pane, file: view.file, sessionId: view.sessionId };
      if (pdfAutoBox() && !inlineEl && !regionMode) setRegionMode(true);
    }

    function lsRead(cwd) {
      var ls = localStore();
      if (!ls) return [];
      try { return parseList(ls.getItem(LS_PREFIX + cwd)); } catch (err) { return []; }
    }

    function lsWrite(cwd, list) {
      var ls = localStore();
      if (!ls) return false;
      try {
        if (!list.length) { ls.removeItem(LS_PREFIX + cwd); return true; }
        ls.setItem(LS_PREFIX + cwd, JSON.stringify({ version: 2, annotations: serializeList(list) }));
        return true;
      } catch (err) {
        return false;
      }
    }

    /** Host request timeout: a hung route must not pin a workspace out of retries. */
    var REQUEST_TIMEOUT_MS = 8000;

    /** sessionId -> workspace root, resolved by the Host and cached across reloads. */
    var cwdBySession = Object.create(null);
    var cwdRequests = new Map();
    var CWD_LS_PREFIX = 'dsh.file-annotations.cwd.v1:';

    function rememberCwd(sessionId, cwd) {
      if (!sessionId || !cwd) return;
      var changed = cwdBySession[sessionId] !== cwd;
      cwdBySession[sessionId] = cwd;
      var ls = localStore();
      if (ls) try { ls.setItem(CWD_LS_PREFIX + sessionId, cwd); } catch (err) { /* quota: memory cache still works */ }
      if (changed && installed) bump();
    }

    function cachedCwd(sessionId) {
      if (!sessionId) return null;
      if (cwdBySession[sessionId]) return cwdBySession[sessionId];
      var ls = localStore();
      if (!ls) return null;
      try {
        var value = ls.getItem(CWD_LS_PREFIX + sessionId);
        if (typeof value === 'string' && value) {
          cwdBySession[sessionId] = value;
          return value;
        }
      } catch (err) { /* ignore */ }
      return null;
    }

    /**
     * Ask the Host for a Session's workspace root. The preview can be opened from a
     * chat link or a deliverable card without the file tree ever mounting, so the
     * browser half cannot derive this and must not guess with `dirname`.
     * @returns Promise<string|null>
     */
    function resolveCwd(sessionId) {
      var cached = cachedCwd(sessionId);
      if (cached) return Promise.resolve(cached);
      if (!sessionId) return Promise.resolve(null);
      if (cwdRequests.has(sessionId)) return cwdRequests.get(sessionId);
      var request = post(RESOLVE_ROUTE, { sessionId: sessionId })
        .then(function (value) {
          var cwd = value && typeof value.cwd === 'string' ? value.cwd : null;
          if (cwd) rememberCwd(sessionId, cwd);
          return cwd;
        })
        .catch(function () { return null; })
        .finally(function () { cwdRequests.delete(sessionId); });
      cwdRequests.set(sessionId, request);
      return request;
    }

    /** POST one JSON body to a document-relative host route. */
    function post(route, payload) {
      if (typeof fetch !== 'function') return Promise.reject(new Error('no-fetch'));
      var init = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      };
      try {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        }
      } catch (err) { /* older engines: no timeout, behaves as before */ }
      return fetch(route, init).then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok || !data || data.ok !== true) {
            var code = data && data.error ? data.error.code : 'http-' + response.status;
            var error = new Error(code);
            error.code = code;
            throw error;
          }
          return data.value;
        });
      });
    }

    /** Load the workspace batch: host store first, localStorage as the fallback. */
    function loadStore(cwd) {
      if (!cwd) return Promise.resolve([]);
      if (loadState[cwd] === 'loading') return loadPromises.get(cwd) || Promise.resolve(itemsOf(cwd));
      if (loadState[cwd] === 'ready') return Promise.resolve(itemsOf(cwd));
      loadState[cwd] = 'loading';
      var cached = lsRead(cwd);
      if (!byCwd[cwd] && cached.length > 0) byCwd[cwd] = cached;
      var baseline = serializeList(itemsOf(cwd));
      var request = post(READ_ROUTE, { cwd: cwd })
        .then(function (value) {
          var list = filterClosingNotes(cwd, value && Array.isArray(value.annotations) ? serializeList(value.annotations) : []);
          var current = serializeList(itemsOf(cwd));
          if (JSON.stringify(current) !== JSON.stringify(baseline)) {
            var before = new Map(baseline.map(function (item) { return [item.id, JSON.stringify(item)]; }));
            var present = new Map(current.map(function (item) { return [item.id, item]; }));
            list = list.filter(function (item) { return !before.has(item.id) || present.has(item.id); });
            current.forEach(function (item) {
              if (before.get(item.id) === JSON.stringify(item)) return;
              var index = list.findIndex(function (stored) { return stored.id === item.id; });
              if (index >= 0) list[index] = item; else list.push(item);
            });
          }
          byCwd[cwd] = list;
          loadState[cwd] = 'ready';
          lsWrite(cwd, list);
          bump();
          if (panelOpen) rerender();
          syncMarkers();
          return list;
        })
        .catch(function () {
          loadState[cwd] = 'offline';
          if (!byCwd[cwd]) byCwd[cwd] = cached;
          bump();
          if (panelOpen) rerender();
          byCwd[cwd] = filterClosingNotes(cwd, itemsOf(cwd));
          return itemsOf(cwd);
        });
      loadPromises.set(cwd, request);
      request.finally(function () { if (loadPromises.get(cwd) === request) loadPromises.delete(cwd); });
      return request;
    }

    function saveStore(cwd) {
      if (!cwd) return Promise.resolve(false);
      var list = itemsOf(cwd);
      lsWrite(cwd, list);
      var previous = saveQueues.get(cwd) || Promise.resolve();
      var next = previous.catch(function () {}).then(function () { return loadPromises.get(cwd); }).then(function () {
        lsWrite(cwd, itemsOf(cwd));
        var protectedIds = Array.from(protectedCropIds.get(cwd) || []);
        var removedIds = Array.from(removedCropIds.get(cwd) || []);
        return post(WRITE_ROUTE, { cwd: cwd, annotations: serializeList(itemsOf(cwd)), protectedCropIds: protectedIds, removedCropIds: removedIds }).then(function (value) {
          clearPersistedCropIds(protectedCropIds, cwd, protectedIds);
          clearPersistedCropIds(removedCropIds, cwd, removedIds);
          return value;
        });
      })
        .then(function () {
          loadState[cwd] = 'ready';
          return true;
        })
        .catch(function () {
          loadState[cwd] = 'offline';
          return false;
        });
      saveQueues.set(cwd, next);
      next.finally(function () { if (saveQueues.get(cwd) === next) saveQueues.delete(cwd); });
      return next;
    }

    function clearPersistedCropIds(map, cwd, ids) {
      var held = map.get(cwd);
      if (!held) return;
      ids.forEach(function (id) { held.delete(id); });
      if (!held.size) map.delete(cwd);
    }

    function releaseClosedCrop(cwd, note) {
      if (note.sentAt) protectClosedCrop(cwd, note.id);
      else {
        if (!removedCropIds.has(cwd)) removedCropIds.set(cwd, new Set());
        removedCropIds.get(cwd).add(note.id);
      }
      cropPreviews.delete(note.id);
      editingNotes.delete(note.id);
    }

    function clearCloseUndo() {
      if (!closeUndo) return;
      clearTimeout(closeUndo.timer); if (closeUndo.node) closeUndo.node.remove();
      closeUndo.groups = [];
      closeUndo = null;
    }

    function closedTargetKey(target) { return target.cwd + '\n' + target.sessionId + '\n' + target.path; }

    function appendCloseUndo(snapshot, cwd, notes) {
      if (!snapshot || snapshot !== closeUndo || Date.now() >= snapshot.expires || !notes.length) return;
      var group = snapshot.groups.find(function (item) { return item.cwd === cwd; });
      if (!group) { group = {cwd:cwd,notes:[]}; snapshot.groups.push(group); }
      notes.forEach(function (note) { if (!group.notes.some(function (item) { return item.id === note.id; })) group.notes.push(note); });
      var count = snapshot.groups.reduce(function (sum, item) { return sum + item.notes.length; }, 0);
      if (!snapshot.node) {
        snapshot.node = element('div', 'undoNotice'); snapshot.node.setAttribute('role','status');
        snapshot.label = element('span','undoLabel'); snapshot.node.appendChild(snapshot.label);
        snapshot.node.appendChild(button('ghost',t('undoClose'),undoClosedNotes,t('undoCloseHint')));
        document.body.appendChild(snapshot.node);
      }
      snapshot.label.textContent = t('closedNotes',{n:count});
    }

    function filterClosingNotes(cwd, notes) {
      return notes.filter(function (note) {
        var target = closingTargets.get(closedTargetKey({cwd:cwd,sessionId:note.sessionId,path:note.path}))
          || closingTargets.get(closedTargetKey({cwd:cwd,sessionId:note.sessionId,path:null}));
        if (!target || noteInFlight(note)) return true;
        releaseClosedCrop(cwd, note);
        appendCloseUndo(target.undo,cwd,[note]); return false;
      });
    }

    function protectClosedCrop(cwd, id) {
      if (!protectedCropIds.has(cwd)) protectedCropIds.set(cwd,new Set());
      protectedCropIds.get(cwd).add(id);
    }

    function persistClosedCwd(cwd, targets, snapshot, retry) {
      if (closeRetryTimers.has(cwd)) { clearTimeout(closeRetryTimers.get(cwd)); closeRetryTimers.delete(cwd); }
      return saveStore(cwd).then(function (ok) {
        if (!ok) {
          if (installed) {
            if (!retry) flash(t('closeRetry'));
            closeRetryTimers.set(cwd,setTimeout(function () { closeRetryTimers.delete(cwd); persistClosedCwd(cwd,targets,snapshot,true); },3000));
          }
          return false;
        }
        targets.filter(function (target) { return target.cwd === cwd; }).forEach(function (target) {
          var key=closedTargetKey(target); if (closingTargets.get(key) && closingTargets.get(key).undo===snapshot) closingTargets.delete(key);
        });
        if (byCwd[cwd] && !byCwd[cwd].length) { delete byCwd[cwd]; delete loadState[cwd]; }
        return true;
      });
    }

    function undoClosedNotes() {
      var snapshot = closeUndo;
      if (!snapshot || Date.now() >= snapshot.expires) { clearCloseUndo(); return false; }
      var groups = snapshot.groups;
      snapshot.targets.forEach(function (target) { closingTargets.delete(closedTargetKey(target)); });
      clearCloseUndo();
      groups.forEach(function (group) {
        var list = itemsOf(group.cwd), known = new Set(list.map(function (item) { return item.id; }));
        serializeList(group.notes).forEach(function (item) { if (!known.has(item.id)) list.push(item); });
        lsWrite(group.cwd, list); saveStore(group.cwd);
      });
      bump(); rerender(); syncMarkers(); return true;
    }

    /** Remove metadata now; the Host collects only proven unreferenced crops after Undo expires. */
    function clearPreviewNotes(targets) {
      var matches = function (item,cwd) { return targets.some(function (target) { return target.cwd===cwd && target.sessionId===item.sessionId && (!target.path || target.path===item.path); }); };
      var hasNotes = Object.keys(byCwd).some(function (cwd) { return byCwd[cwd].some(function (item) { return matches(item,cwd) && !noteInFlight(item); }); });
      var hasLoading = targets.some(function (target) { return loadPromises.has(target.cwd); });
      if (!hasNotes && !hasLoading) {
        targets.forEach(function (target) {
          if (itemsOf(target.cwd).some(function (item) { return matches(item,target.cwd) && noteInFlight(item); })
              && !deferredCloses.some(function (held) { return closedTargetKey(held)===closedTargetKey(target); })) deferredCloses.push(target);
        });
        if (targets.some(function (target) { return (!target.path || target.path===view.file) && target.sessionId===view.sessionId; })) { resetInteraction(); closePanel(); }
        return 0; // Duplicate lifecycle reports must not erase a live Undo offer.
      }
      clearCloseUndo();
      var snapshot = {groups:[],targets:targets,node:null,expires:Date.now()+CLOSE_UNDO_MS};
      snapshot.timer = setTimeout(clearCloseUndo,CLOSE_UNDO_MS); closeUndo = snapshot;
      targets.forEach(function (target) { closingTargets.set(closedTargetKey(target),Object.assign({},target,{undo:snapshot})); });
      var groups = [], deferred = [];
      Object.keys(byCwd).forEach(function (cwd) {
        var notes = itemsOf(cwd), removed = [];
        byCwd[cwd] = notes.filter(function (item) {
          var match = targets.some(function (target) { return target.cwd === cwd && target.sessionId === item.sessionId && (!target.path || target.path === item.path); });
          if (!match) return true;
          if (noteInFlight(item)) { deferred = deferred.concat(targets.filter(function (target) { return target.cwd === cwd && target.sessionId === item.sessionId && (!target.path || target.path === item.path); })); return true; }
          releaseClosedCrop(cwd, item);
          removed.push(item); return false;
        });
        if (!removed.length) return;
        if (saveTimers[cwd]) { clearTimeout(saveTimers[cwd]); delete saveTimers[cwd]; }
        groups.push({ cwd: cwd, notes: removed });
        appendCloseUndo(snapshot,cwd,removed);
        lsWrite(cwd, byCwd[cwd]);
      });
      Array.from(new Set(targets.map(function (target) { return target.cwd; }))).forEach(function (cwd) {
        persistClosedCwd(cwd,targets,snapshot,false);
      });
      deferred.forEach(function (target) { if (!deferredCloses.some(function (held) { return held.cwd === target.cwd && held.sessionId === target.sessionId && held.path === target.path; })) deferredCloses.push(target); });
      if (targets.some(function (target) { return (!target.path || target.path === view.file) && target.sessionId === view.sessionId; })) { resetInteraction(); closePanel(); }
      var count = groups.reduce(function (sum, group) { return sum + group.notes.length; }, 0);
      bump(); rerender(); syncMarkers();
      return count;
    }

    function previewKey(owner, tabId) { return owner + '\n' + tabId; }

    function trackPreviewLifetime(owner) {
      if (!owner || !view.file || !view.cwd || !view.sessionId) return;
      var tab = owner.closest('[data-sidebar-right-tab]'), panel = owner.closest('[data-sidebar-right-panel]');
      if (!tab || !panel) return;
      var ownerId = panel.getAttribute('data-sidebar-right-session') || view.sessionId;
      if (!previewPanels.has(ownerId)) previewPanels.set(ownerId,panel.getAttribute('data-sidebar-right-open') != null);
      var key = previewKey(ownerId, tab.getAttribute('data-sidebar-right-tab'));
      var previous = previewLifetimes.get(key);
      if (previous && (previous.path !== view.file || previous.sessionId !== view.sessionId)) clearPreviewNotes([previous]);
      previewLifetimes.set(key, { key: key, owner: ownerId, tabId: tab.getAttribute('data-sidebar-right-tab'),
        path: view.file, cwd: view.cwd, sessionId: view.sessionId, open: panel.getAttribute('data-sidebar-right-open') != null, closed: false });
    }

    /** Tab membership, not component unmount/visibility: switching tabs keeps notes. */
    function syncPreviewLifetimes() {
      if (!installed) return;
      var nav = composerRuntime && composerRuntime.sidebarRight;
      var rows = nav && nav.openTabs && nav.openTabs.getSnapshot ? nav.openTabs.getSnapshot() : null;
      var membership = rows ? new Set(rows.map(function (row) { return previewKey(row.sessionId, row.tabId); })) : null;
      var panels = Array.prototype.slice.call(document.querySelectorAll('[data-sidebar-right-panel]'));
      var targets = [], gone = [];
      var presentPanels = new Set();
      panels.forEach(function (panel) {
        var owner = panel.getAttribute('data-sidebar-right-session'); if (!owner) return;
        presentPanels.add(owner);
        var open = panel.getAttribute('data-sidebar-right-open') != null;
        if (previewPanels.get(owner) === true && !open) {
          var destinations = new Set([owner]);
          previewLifetimes.forEach(function (record) { if (record.owner === owner) destinations.add(record.sessionId); });
          var workspaces = new Set(Object.keys(byCwd).concat(Array.from(loadPromises.keys())));
          workspaces.forEach(function (cwd) { destinations.forEach(function (sessionId) { targets.push({cwd:cwd,sessionId:sessionId,path:null}); }); });
        }
        previewPanels.set(owner,open);
      });
      previewPanels.forEach(function (_open,owner) { if (!presentPanels.has(owner)) previewPanels.delete(owner); });
      previewLifetimes.forEach(function (record, key) {
        var panel = panels.find(function (node) { return node.getAttribute('data-sidebar-right-session') === record.owner; });
        var open = panel ? panel.getAttribute('data-sidebar-right-open') != null : null;
        var exists = membership ? membership.has(key) : panel ? Array.prototype.some.call(panel.querySelectorAll('[data-sidebar-right-tab]'), function (node) { return node.getAttribute('data-sidebar-right-tab') === record.tabId; }) : true;
        var sidebarClosed = record.open && open === false;
        if (!exists || sidebarClosed) {
          if (!record.closed) targets.push(record);
          record.closed = true; if (!exists) gone.push(key);
        } else if (open === true && !record.open) record.closed = false;
        if (open != null) record.open = open;
      });
      // Closing one of two occurrences of the same file leaves the other usable.
      targets = targets.filter(function (target) { return !Array.from(previewLifetimes.values()).some(function (other) {
        return !other.closed && other.cwd === target.cwd && other.sessionId === target.sessionId && other.path === target.path;
      }); });
      gone.forEach(function (key) { previewLifetimes.delete(key); });
      targets = targets.filter(function (target,index) {
        return !targets.some(function (other,i) { return i !== index && other.cwd === target.cwd && other.sessionId === target.sessionId
          && ((!other.path && target.path) || (closedTargetKey(other) === closedTargetKey(target) && i < index)); });
      });
      if (targets.length) clearPreviewNotes(targets);
    }

    function scheduleSave(cwd) {
      if (!cwd) return;
      if (saveTimers[cwd]) clearTimeout(saveTimers[cwd]);
      saveTimers[cwd] = setTimeout(function () {
        saveTimers[cwd] = null;
        saveStore(cwd);
      }, 160);
    }

    function addAnnotation(cwd, input) {
      var record = makeRecord(input);
      if (!record || !cwd) return null;
      itemsOf(cwd).push(record);
      scheduleSave(cwd);
      bump();
      rerender();
      syncMarkers();
      return record;
    }

    function removeAnnotation(cwd, id) {
      if (!cwd) return false;
      var list = itemsOf(cwd);
      var index = -1;
      for (var i = 0; i < list.length; i += 1) if (list[i].id === id) { index = i; break; }
      if (index < 0) return false;
      list.splice(index, 1);
      scheduleSave(cwd);
      bump();
      rerender();
      syncMarkers();
      return true;
    }

    function adoptAnnotation(cwd, id, sessionId) {
      var item = itemsOf(cwd).find(function (note) { return note.id === id; });
      if (!sessionId || !item || item.sentAt || noteInFlight(item)) return false;
      item.sessionId = sessionId;
      delete item.detached;
      scheduleSave(cwd); bump(); rerender(); syncMarkers();
      return true;
    }

    /** Is this note part of the view the user is looking at? */
    function inScope(item) {
      if (scope === 'all') return true;
      var mine = view.sessionId || '';
      return (typeof item.sessionId === 'string' ? item.sessionId : '') === mine;
    }

    /** Counts for one Session inside one workspace (used by the entry buttons). */
    function countsFor(cwd, sessionId) {
      var mine = sessionId || '';
      var total = 0;
      var unsent = 0;
      itemsOf(cwd).forEach(function (item) {
        if ((typeof item.sessionId === 'string' ? item.sessionId : '') !== mine) return;
        total += 1;
        if (!item.sentAt) unsent += 1;
      });
      return { total: total, unsent: unsent };
    }

    /** Notes this panel/marker layer shows. */
    function visibleOf(cwd) {
      return itemsOf(cwd).filter(inScope);
    }

    /**
     * The batch that 「发给 AI」 may send: always the current Session's unsent notes.
     * The 「全部会话」 toggle is a *view* switch; it must never push another
     * conversation's notes into this conversation's composer.
     */
    function unsentOf(cwd) {
      var mine = view.sessionId || '';
      return itemsOf(cwd).filter(function (item) {
        return !item.sentAt && (typeof item.sessionId === 'string' ? item.sessionId : '') === mine;
      });
    }

    // ======================================================================
    // 四、prompt 打包
    // ======================================================================

    /** Inline for a short single-line selection; a code fence for anything bigger. */
    function quoteBlock(quote) {
      if (!quote) return '';
      var lines = quote.split(/\r?\n/);
      if (lines.length === 1 && quote.length <= 240) return '`' + quote.replace(/`/g, "'") + '`';
      var body = lines.slice(0, 12).join('\n');
      if (lines.length > 12) body += '\n…（已截断）';
      return '\n```\n' + body + '\n```\n';
    }

    /**
     * Turn a batch into one prompt. Pure: no DOM, no store, easy to assert on.
     * @param list - annotation records.
     * @returns prompt text, or '' when there is nothing unsent.
     */
    function buildPrompt(list) {
      var items = (Array.isArray(list) ? list : []).filter(function (item) {
        return item && !item.sentAt && (item.comment || item.quote);
      });
      if (items.length === 0) return '';
      var groups = Object.create(null);
      var order = [];
      items.forEach(function (item) {
        var key = item.rel || item.path;
        if (!groups[key]) {
          groups[key] = [];
          order.push(key);
        }
        groups[key].push(item);
      });
      var out = [];
      out.push('以下是我在文件上写的 ' + items.length + ' 条批注，请据此继续完善（逐条处理，改完说明每条是怎么改的）。');
      out.push('');
      for (var g = 0; g < order.length; g += 1) {
        var group = groups[order[g]];
        out.push('### ' + order[g]);
        for (var i = 0; i < group.length; i += 1) {
          var item = group[i];
          var head;
          if (item.htmlAnchor && item.htmlAnchor.kind === 'element') {
            head = String(i + 1) + '. 【网页元素】';
          } else if (item.region) {
            var where = item.region.kind === 'pdf'
              ? '第 ' + (item.region.page || 1) + ' 页'
              : item.region.kind === 'html' ? (item.htmlAnchor ? 'HTML 元素内' : 'HTML 旧视口') : '图片';
            head = String(i + 1) + '. 【区域】' + where
              + ' (x=' + Math.round(item.region.x * 100) + '%, y=' + Math.round(item.region.y * 100)
              + '%, w=' + Math.round(item.region.w * 100) + '%, h=' + Math.round(item.region.h * 100) + '%)';
          } else if (item.quote) {
            head = String(i + 1) + '. 【选中】' + (item.anchor && item.anchor.page ? '第 ' + item.anchor.page + ' 页 ' : '') + quoteBlock(item.quote);
          } else {
            head = String(i + 1) + '. 【整文件】';
          }
          out.push(head);
          if (item.htmlAnchor) {
            out.push('   网页元素：' + item.htmlAnchor.selector + (item.htmlAnchor.tag ? ' <' + item.htmlAnchor.tag + '>' : ''));
            if (item.region && item.quote) out.push('   元素文字：' + quoteBlock(item.quote));
          }
          if (item.crop) out.push('   裁剪图：' + item.crop + '（用文件工具打开这张图看框选内容）');
          out.push('   批注：' + (item.comment || '（没有写评论）'));
        }
        out.push('');
      }
      out.push('请以本条消息中的原文、批注和裁剪图为准。');
      return out.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    // ======================================================================
    // 五、输入框桥（隐藏锚点，只为拿 inputActions）
    // ======================================================================

    function registerBridge(el, props) {
      var sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : null;
      var actions = props && props.inputActions ? props.inputActions : null;
      for (var i = 0; i < bridges.length; i += 1) {
        if (bridges[i].el === el) {
          bridges[i].sessionId = sessionId;
          bridges[i].inputActions = actions;
          return function () { /* same element: nothing to undo */ };
        }
      }
      var entry = { el: el, sessionId: sessionId, inputActions: actions };
      bridges.push(entry);
      return function () {
        var index = bridges.indexOf(entry);
        if (index >= 0) bridges.splice(index, 1);
      };
    }

    /** Pick the composer bridge for the current view (session match wins). */
    function pickBridge() {
      var usable = bridges.filter(function (entry) {
        return entry.inputActions
          && typeof entry.inputActions.captureInsertion === 'function'
          && typeof entry.inputActions.insertText === 'function';
      });
      if (usable.length === 0) return null;
      if (view.sessionId) {
        for (var i = 0; i < usable.length; i += 1) {
          if (usable[i].sessionId === view.sessionId) return usable[i];
        }
        // A known Session with no matching composer must NOT borrow another
        // Session's draft: that would type the batch into the wrong conversation.
        return null;
      }
      return usable[usable.length - 1];
    }

    /**
     * Write text into the current Session's draft.
     * @param text - prompt body.
     * @returns true when the composer accepted the insertion.
     */
    function insertIntoComposer(text) {
      if (!text) return false;
      var bridge = pickBridge();
      if (!bridge) return false;
      try {
        var span = bridge.inputActions.captureInsertion();
        return bridge.inputActions.insertText(text, span) === true;
      } catch (err) {
        return false;
      }
    }

    /** Pending cards and the native reference always address an explicit Session. */
    function pendingFor(cwd, sessionId) {
      if (!cwd || !sessionId) return [];
      return itemsOf(cwd).filter(function (item) { return !item.sentAt && !item.detached && item.sessionId === sessionId; });
    }

    function detachPending(cwd, sessionId) {
      var notes = pendingFor(cwd, sessionId);
      if (!notes.length || composerFlights.has(sessionId)) return false;
      notes.forEach(function (item) { item.detached = true; editingNotes.delete(item.id); });
      composerErrors.delete(sessionId);
      scheduleSave(cwd); bump(); rerender(); syncMarkers();
      return true;
    }

    function hasNoteReference(state, ref) {
      return (state.occurrences || []).some(function (o) { return o.source === PKG && o.ref === ref; })
        || state.draft.indexOf('@' + ref) >= 0;
    }

    function noteFingerprint(item) {
      return JSON.stringify([item.path, item.sessionId, item.quote, item.comment, item.region || null, item.crop || null, item.anchor || null, item.htmlAnchor || null]);
    }

    function updateAnnotation(cwd, id, comment) {
      if (!cwd || typeof comment !== 'string' || comment.trim() === '') return false;
      var item = itemsOf(cwd).find(function (note) { return note.id === id; });
      if (!item || item.sentAt || noteInFlight(item)) return false;
      item.comment = comment.trim().slice(0, 4000);
      scheduleSave(cwd); bump(); rerender(); syncMarkers();
      return true;
    }

    function noteInFlight(item) {
      var flight = item && composerFlights.get(item.sessionId);
      return !!(flight && flight.notes.some(function (note) { return note.id === item.id; }));
    }

    function scheduleReferenceSync(entry) {
      if (!installed || entry.timer) return;
      entry.timer = setTimeout(function () { entry.timer = null; syncComposerReference(entry); }, 0);
    }

    /** Input spans count a reference chip as one character, unlike clipboard text. */
    function detectOffset(state, clipboardOffset) {
      var offset = clipboardOffset;
      (state.occurrences || []).forEach(function (occurrence) {
        if (occurrence.offset < clipboardOffset) offset -= occurrence.length - 1;
      });
      return offset;
    }

    function syncComposerReference(entry) {
      if (!composerRuntime || composerRuntime.sessions.binding(entry.sessionId) !== entry.binding) return;
      var state = entry.input.state.getSnapshot();
      if (state.phase !== 'plain' || composerFlights.has(entry.sessionId)) return;
      var notes = pendingFor(entry.cwd, entry.sessionId);
      var own = (state.occurrences || []).filter(function (o) { return o.source === PKG && o.ref === entry.ref; });
      var token = '@' + entry.ref;
      var persisted = state.draft.indexOf(token);
      entry.syncing = true;
      try {
        if (notes.length > 0 && own.length === 0) {
          // Append without replacing a selection, changing existing chips, or taking focus.
          // After reload, DSH's draft mirror contains the clipboard spelling.
          // Reconstitute our own token in place instead of appending a duplicate.
          var startAt = persisted >= 0 ? detectOffset(state, persisted) : detectOffset(state, state.draft.length);
          entry.input.insertReference({ source: PKG, ref: entry.ref, label: t('noteReference'), appearance: 'file', clipboardText: token },
            { start: startAt, end: startAt + (persisted >= 0 ? token.length : 0), draftRev: state.draftRev });
        } else if (notes.length === 0 && own.length === 0 && persisted >= 0) {
          var plainStart = detectOffset(state, persisted);
          entry.binding.ctx.bail(entry.binding.ctx, 'slash/input-insert-text', {
            text: '', span: { start: plainStart, end: plainStart + token.length, draftRev: state.draftRev }
          });
        } else if ((notes.length === 0 || own.length > 1) && own.length > 0) {
          var occurrence = own[own.length - 1];
          var start = detectOffset(state, occurrence.offset);
          entry.binding.ctx.bail(entry.binding.ctx, 'slash/input-consume-token', {
            guard: { kind: 'span', span: { start: start, end: start + 1, draftRev: state.draftRev } }
          });
        }
      } finally { entry.syncing = false; }
    }

    function finishComposerFlight(entry, flight, success) {
      if (composerFlights.get(entry.sessionId) !== flight) return;
      composerFlights.delete(entry.sessionId);
      if (success) {
        var now = Date.now();
        flight.notes.forEach(function (sent) {
          var current = itemsOf(flight.cwd).find(function (item) { return item.id === sent.id; });
          if (current && !current.sentAt && noteFingerprint(current) === noteFingerprint(sent)) { current.sentAt = now; protectClosedCrop(flight.cwd,current.id); }
        });
        composerErrors.delete(entry.sessionId);
        if (installed) scheduleSave(flight.cwd);
        else saveStore(flight.cwd);
      } else composerErrors.set(entry.sessionId, t('pendingFailed'));
      if (installed) { bump(); rerender(); syncMarkers(); }
      if (deferredCloses.length) {
        var closed = deferredCloses; deferredCloses = [];
        if (success) saveStore(flight.cwd).then(function (ok) { if (ok) clearPreviewNotes(closed); else deferredCloses = deferredCloses.concat(closed); });
        else clearPreviewNotes(closed);
      }
    }

    /** Wrap only this Session's public prompt method to observe Host admission. */
    function bindComposerSession(sessionId, cwd, actions) {
      if (!composerRuntime || !sessionId || !cwd) return null;
      var binding = composerRuntime.sessions.binding(sessionId);
      if (!binding) return null;
      var previous = composerEntries.get(sessionId);
      if (previous && previous.binding === binding) {
        previous.cwd = cwd; previous.actions = actions || previous.actions;
        scheduleReferenceSync(previous);
        return previous;
      }
      if (previous) previous.dispose();
      var input = composerRuntime.conversation.input.for(binding.ctx);
      var entry = { sessionId: sessionId, cwd: cwd, binding: binding, input: input, actions: actions,
        ref: REF_PREFIX + sessionId, timer: null, lastState: input.state.getSnapshot(), syncing: false };
      var session = binding.session;
      var original = session.prompt;
      var ownDescriptor = Object.getOwnPropertyDescriptor(session, 'prompt');
      var wrapped = function () {
        var args = arguments;
        var flight = composerFlights.get(sessionId);
        var text = Array.isArray(args[0]) ? args[0].filter(function (part) { return part.type === 'text'; }).map(function (part) { return part.text; }).join('\n') : '';
        var includesBatch = flight && text.indexOf(flight.prompt) >= 0 && !flight.submitting;
        if (includesBatch) { flight.submitting = true; composerErrors.delete(sessionId); bump(); }
        var pending;
        try { pending = original.apply(this, args); }
        catch (error) { if (includesBatch) finishComposerFlight(entry, flight, false); throw error; }
        return Promise.resolve(pending).then(function (result) {
          if (includesBatch) finishComposerFlight(entry, flight, !!(result && result.ok === true));
          return result;
        }, function (error) {
          if (includesBatch) finishComposerFlight(entry, flight, false);
          throw error;
        });
      };
      session.prompt = wrapped;
      var unsubscribe = input.state.subscribe(function () {
        var flight = composerFlights.get(sessionId);
        var state = input.state.getSnapshot();
        var before = entry.lastState;
        entry.lastState = state;
        // Native submission clears the editor during its non-plain phase.
        // Only a user's plain-to-plain removal detaches the saved batch.
        if (!entry.syncing && !flight && before.phase === 'plain' && state.phase === 'plain') {
          if (hasNoteReference(before, entry.ref) && !hasNoteReference(state, entry.ref)) detachPending(entry.cwd, sessionId);
          else if (!hasNoteReference(before, entry.ref) && hasNoteReference(state, entry.ref)) {
            var restored = itemsOf(entry.cwd).filter(function (item) { return item.sessionId === sessionId && !item.sentAt && item.detached; });
            if (restored.length) {
              restored.forEach(function (item) { delete item.detached; });
              scheduleSave(entry.cwd); bump(); rerender();
            }
          }
        }
        if (flight && !flight.submitting && state.draftRev > flight.inputRevision
            && (state.occurrences || []).some(function (o) { return o.source === PKG && o.ref === entry.ref; })) {
          // A different reference owner refused serialization; the native input
          // has restored this attempt before it ever reached session.prompt.
          finishComposerFlight(entry, flight, false);
        }
        scheduleReferenceSync(entry);
      });
      entry.dispose = function () {
        entry.syncing = true;
        if (entry.timer) clearTimeout(entry.timer);
        unsubscribe();
        try {
          var state = input.state.getSnapshot();
          var own = (state.occurrences || []).find(function (o) { return o.source === PKG && o.ref === entry.ref; });
          if (state.phase === 'plain' && own) {
            var start = detectOffset(state, own.offset);
            binding.ctx.bail(binding.ctx, 'slash/input-consume-token', { guard: { kind: 'span',
              span: { start: start, end: start + 1, draftRev: state.draftRev } } });
          }
        } catch (error) { /* the Session scope may already have been released */ }
        if (session.prompt === wrapped) {
          if (ownDescriptor) Object.defineProperty(session, 'prompt', ownDescriptor);
          else delete session.prompt;
        }
      };
      composerEntries.set(sessionId, entry);
      rememberCwd(sessionId, cwd);
      loadStore(cwd);
      scheduleReferenceSync(entry);
      return entry;
    }

    /** Public reference codecs are expanded by DSH's normal Send/Enter pipeline. */
    function createAnnotationSource() {
      return {
        trigger: '@', name: PKG, order: 950, showGroupTitle: false,
        candidates: function () { return Promise.resolve([]); },
        onPick: function () { return undefined; },
        lexicon: function (session) { return [REF_PREFIX + session.sessionId]; },
        codec: {
          clipboardText: function (ref) { return '@' + ref; },
          serialize: async function (ref, signal) {
            if (typeof ref !== 'string' || ref.indexOf(REF_PREFIX) !== 0) throw new Error(t('pendingUnavailable'));
            var sessionId = ref.slice(REF_PREFIX.length);
            var entry = composerEntries.get(sessionId);
            if (!entry || !composerRuntime || composerRuntime.sessions.binding(sessionId) !== entry.binding) throw new Error(t('pendingUnavailable'));
            if (composerFlights.has(sessionId)) throw new Error(t('pendingBusy'));
            if (pendingFor(entry.cwd, sessionId).some(function (item) { return editingNotes.has(item.id); })) throw new Error(t('finishEdit'));
            var jobs = pendingFor(entry.cwd, sessionId).map(function (item) { return cropJobs.get(item.id); }).filter(Boolean);
            await Promise.all(jobs);
            if (signal && signal.aborted) throw new Error('aborted');
            var notes = serializeList(pendingFor(entry.cwd, sessionId));
            if (notes.length === 0) throw new Error(t('pendingEmpty'));
            // Two parallel serializers must not reserve the same note batch.
            if (composerFlights.has(sessionId)) throw new Error(t('pendingBusy'));
            var flight = { cwd: entry.cwd, sessionId: sessionId, notes: notes, prompt: buildPrompt(notes), submitting: false,
              inputRevision: entry.input.state.getSnapshot().draftRev };
            composerFlights.set(sessionId, flight);
            if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', function () {
              if (!flight.submitting) finishComposerFlight(entry, flight, false);
            }, { once: true });
            composerErrors.delete(sessionId); bump();
            return '\n\n' + flight.prompt + '\n\n';
          }
        },
        openReference: function (session) {
          var entry = composerEntries.get(session.sessionId);
          if (!entry) return false;
          entry.input.focus(); return true;
        }
      };
    }

    function connectComposerRuntime(runtime) {
      composerRuntime = runtime;
      var unregister = runtime.inputTriggers.registerSource(createAnnotationSource());
      var unwatchTabs = runtime.sidebarRight && runtime.sidebarRight.openTabs && runtime.sidebarRight.openTabs.subscribe
        ? runtime.sidebarRight.openTabs.subscribe(syncPreviewLifetimes) : function () {};
      var unmount = runtime.sidebarRight && runtime.sidebarRight.mounted ? runtime.sidebarRight.mounted.subscribe(function () {
        var id = runtime.sidebarRight.mounted.getSnapshot();
        if (view.sessionId !== id) { setViewSession(id || null); view.file = null; view.pane = null; clearMarkers(); }
        bump();
      }) : function () {};
      bump();
      var disposed = false;
      var cleanup = function () {
        if (disposed) return;
        disposed = true;
        composerEntries.forEach(function (entry) { entry.dispose(); });
        composerEntries.clear();
        unmount();
        unwatchTabs();
        unregister();
        if (composerRuntime === runtime) composerRuntime = null;
      };
      runtimeDisposers.push(cleanup);
      return cleanup;
    }

    function focusPending() {
      var entry = view.sessionId && composerEntries.get(view.sessionId);
      if (!entry) { flash(t('pendingUnavailable')); return false; }
      syncComposerReference(entry); entry.input.focus(); closePanel();
      return true;
    }

    /** All explicit send actions still use DSH's native transaction and codecs. */
    function submitPending(sessionId, cwd) {
      var entry = composerEntries.get(sessionId);
      if (!entry || entry.cwd !== cwd || typeof entry.input.submit !== 'function') { flash(t('pendingUnavailable')); return false; }
      if (!pendingFor(cwd, sessionId).length || composerFlights.has(sessionId)) return false;
      if (pendingFor(cwd, sessionId).some(function (item) { return editingNotes.has(item.id); })) { flash(t('finishEdit')); return false; }
      if (entry.input.state.getSnapshot().phase !== 'plain') return false;
      syncComposerReference(entry);
      if (!(entry.input.state.getSnapshot().occurrences || []).some(function (o) { return o.source === PKG && o.ref === entry.ref; })) {
        flash(t('pendingUnavailable')); return false;
      }
      entry.input.submit('queue', 'click');
      return true;
    }

    /** Register the selection shortcut with the desktop adapter as well as Web. */
    function connectShortcuts(shortcuts) {
      var binding = { code: 'KeyE', modifiers: ['primary', 'shift'] };
      var defaults = {};
      // The registry validates every declared profile, even on a Mac. Linux Web
      // currently rejects letter shortcuts; declaring one there rejects the
      // entire command on all devices.
      ['desktop:macos', 'desktop:windows', 'desktop:linux', 'web:macos', 'web:windows'].forEach(function (profile) { defaults[profile] = binding; });
      var off = shortcuts.register({ id: PKG + '.annotate-selection', label: function () { return t('annotateSelection'); },
        aliases: ['annotate selection', '批注选中文字'], defaults: defaults, regions: ['page', 'editable'], modals: [],
        resolve: function () {
          if (inlineEl || regionMode || pointerDown || !view.file || !paneElement()
              || (!selectionInsideSidebar(window.getSelection()) && !(selectionTarget && selectionTarget.htmlAnchor))) return { status: 'pass' };
          return { status: 'handled', run: openSelectionEditor };
        }
      });
      shortcutService = shortcuts;
      var refresh = function () {
        var row = shortcuts.catalog.getSnapshot().find(function (item) { return item.id === PKG + '.annotate-selection'; });
        selectionShortcutLabel = row && !row.issue && !row.conflicts.length ? row.keys.join(isMac() ? '' : '+') : '';
        selectionShortcutBinding = selectionShortcutLabel ? row.binding : null;
        if (selectionAction) {
          var key = selectionAction.querySelector('kbd');
          if (key) key.textContent = selectionKeys();
        }
        syncHtmlNotes();
      };
      refresh();
      var unsubscribe = shortcuts.catalog.subscribe(refresh);
      var stopPreset = installShortcutPreset(shortcuts);
      return function () { stopPreset(); unsubscribe(); off(); if (shortcutService === shortcuts) { shortcutService = null; selectionShortcutLabel = null; selectionShortcutBinding = null; } };
    }

    /** User-requested Desktop preset: edit preferences, never core command defaults. */
    function installShortcutPreset(shortcuts) {
      if (shortcuts.runtime !== 'desktop' || shortcuts.platform !== 'macos' || !shortcuts.edit || !shortcuts.config) return function () {};
      var key = PKG + '.shortcut-preset.cmd-p.v1';
      var storage = localStore();
      var done = false;
      try { done = storage && storage.getItem(key) === 'done'; } catch (error) { /* preferences still validate below */ }
      if (done) return function () {};
      var active = true, busy = false, timer = null, stopped = false;
      var annotate = PKG + '.annotate-selection';
      function same(binding, code) { return binding && binding.code === code && !binding.secondCode && binding.modifiers.length === 1 && (binding.modifiers[0] === 'meta' || binding.modifiers[0] === 'primary'); }
      function schedule() {
        if (!active || stopped || busy || timer) return;
        timer = setTimeout(function () { timer = null; run(); }, 0);
      }
      async function editCurrent(edit) {
        var result;
        for (var attempt = 0; attempt < 4; attempt += 1) {
          result = await shortcuts.edit(edit, shortcuts.config.getSnapshot().revision);
          if (result.status !== 'stale' && result.status !== 'not-ready') return result;
          if (!active) return result;
          await new Promise(function (resolve) { setTimeout(resolve, 30); });
        }
        return result;
      }
      async function run() {
        var snapshot = shortcuts.config.getSnapshot();
        var rows = shortcuts.catalog.getSnapshot();
        if (!active || snapshot.status !== 'ready' || !rows.some(function (r) { return r.id === 'workspace.files'; }) || !rows.some(function (r) { return r.id === annotate; })) return;
        busy = true;
        var profile = snapshot.document.profiles['desktop:macos'] || {};
        var previous = Object.prototype.hasOwnProperty.call(profile, 'workspace.files') ? { type: 'set', id: 'workspace.files', binding: profile['workspace.files'] } : { type: 'reset', id: 'workspace.files' };
        var moved = false;
        try {
          if (!same(rows.find(function (r) { return r.id === 'workspace.files'; }).binding, 'KeyO')) {
            var first = await editCurrent({ type: 'set', id: 'workspace.files', binding: { code: 'KeyO', modifiers: ['primary'] } });
            if (first.status !== 'saved') throw new Error(first.status);
            snapshot = first.snapshot; moved = true;
          }
          var row = shortcuts.catalog.getSnapshot().find(function (r) { return r.id === annotate; });
          if (!same(row && row.binding, 'KeyP')) {
            var second = await editCurrent({ type: 'set', id: annotate, binding: { code: 'KeyP', modifiers: ['primary'] } });
            if (second.status !== 'saved') {
              if (moved) await editCurrent(previous);
              throw new Error(second.status);
            }
          }
          if (storage) {
            try {
              storage.setItem(key + '.backup', JSON.stringify({ files: previous, annotation: profile[annotate] || null }));
              storage.setItem(key, 'done');
            } catch (error) { /* the native preferences were already saved */ }
          }
          stopped = true;
        } catch (error) {
          stopped = true;
          if (active) flash(currentLang() === 'zh' ? '快捷键未能更新，请在 DSH 快捷键设置中检查冲突。' : 'Shortcut update failed. Check DSH shortcut settings for conflicts.');
        } finally { busy = false; }
      }
      var offConfig = shortcuts.config.subscribe(schedule);
      var offCatalog = shortcuts.catalog.subscribe(schedule);
      schedule();
      return function () { active = false; if (timer) clearTimeout(timer); offConfig(); offCatalog(); };
    }

    function matchesSelectionShortcut(event) {
      var binding = shortcutService ? selectionShortcutBinding
        : { code: 'KeyE', modifiers: [isMac() ? 'meta' : 'control', 'shift'] };
      if (!binding || binding.secondCode || event.repeat || event.code !== binding.code) return false;
      return ['meta', 'control', 'shift', 'alt'].every(function (modifier) {
        return !!event[modifier === 'control' ? 'ctrlKey' : modifier + 'Key'] === (binding.modifiers.indexOf(modifier) >= 0);
      });
    }

    // ======================================================================
    // 六、浮层基元
    // ======================================================================

    function element(tag, mark, text) {
      var node = document.createElement(tag);
      if (mark) node.setAttribute(MARK, mark);
      if (text != null) node.textContent = text;
      return node;
    }

    function button(mark, label, onClick, title) {
      var node = document.createElement('button');
      node.type = 'button';
      node.setAttribute(MARK, mark);
      node.textContent = label;
      if (title) node.title = title;
      node.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        onClick(event);
      });
      return node;
    }

    function installStyle() {
      if (document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]')) return;
      var style = document.createElement('style');
      style.setAttribute('data-plugin', PKG);
      style.setAttribute('data-plugin-css', STYLE_TAG_ID);
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }

    function removeStyle() {
      var style = document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]');
      if (style && style.parentNode) style.parentNode.removeChild(style);
    }

    function flash(message) {
      removeFlash();
      flashEl = element('div', 'flash', message);
      flashEl.style.right = '16px';
      flashEl.style.bottom = '24px';
      document.body.appendChild(flashEl);
      flashTimer = setTimeout(function () {
        flashTimer = null;
        removeFlash();
      }, 2200);
    }

    function removeFlash() {
      if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
      if (flashEl && flashEl.parentNode) flashEl.parentNode.removeChild(flashEl);
      flashEl = null;
    }

    // ======================================================================
    // 七、批注面板
    // ======================================================================

    function panelAnchorRect() {
      return paneBox();
    }

    function placePanel() {
      if (!panelEl) return;
      var width = PANEL_WIDTH;
      var rect = panelAnchorRect();
      if (rect) {
        var left = rect.left + 8;
        if (left + width > window.innerWidth - 8) left = Math.max(8, rect.right - width - 8);
        panelEl.style.left = Math.max(8, left) + 'px';
        panelEl.style.top = Math.max(56, rect.top + 44) + 'px';
      } else {
        panelEl.style.left = Math.max(8, window.innerWidth - width - 16) + 'px';
        panelEl.style.top = '72px';
      }
    }

    function buildPanel() {
      if (panelEl) return panelEl;
      panelEl = element('div', 'panel');
      panelEl.setAttribute('role', 'dialog');
      panelEl.setAttribute('aria-label', t('panelTitle'));
      panelEl.style.display = 'none';

      var head = element('div', 'head');
      var title = element('span', 'title', t('panelTitle'));
      var sub = element('span', 'sub', '');
      var scopeBtn = button('scope', t('scopeSession'), function () {
        setScope(scope === 'session' ? 'all' : 'session');
      }, t('scopeAll'));
      var close = button('iconbtn', '×', function () { closePanel(); }, t('close'));
      head.appendChild(title);
      head.appendChild(sub);
      head.appendChild(element('span', 'grow'));
      head.appendChild(scopeBtn);
      head.appendChild(close);

      var list = element('div', 'list');
      var compose = element('div', 'compose');
      var target = element('span', 'target', '');
      var textarea = document.createElement('textarea');
      textarea.setAttribute(MARK, 'textarea');
      textarea.rows = 2;
      textarea.addEventListener('keydown', function (event) {
        if (!event || event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commitCompose();
        }
      });
      var foot = element('div', 'foot');
      var save = button('primary', t('save'), function () { commitCompose(); });
      foot.appendChild(save);
      compose.appendChild(target);
      compose.appendChild(textarea);
      compose.appendChild(foot);

      panelEl.appendChild(head);
      panelEl.appendChild(list);
      panelEl.appendChild(compose);
      document.body.appendChild(panelEl);

      panelParts = { title: title, sub: sub, list: list, target: target, textarea: textarea, save: save, scopeBtn: scopeBtn };
      return panelEl;
    }

    function openPanel(options) {
      var opts = options || {};
      if (opts.sessionId) setViewSession(opts.sessionId);
      if (opts.cwd) view.cwd = opts.cwd;
      if (opts.file) setViewFile(opts.file, opts.rel);
      buildPanel();
      panelOpen = true;
      panelEl.style.display = 'flex';
      if (typeof opts.quote === 'string' && opts.quote !== '') composing.quote = opts.quote.slice(0, MAX_QUOTE);
      if (view.cwd) loadStore(view.cwd);
      placePanel();
      rerender();
      syncMarkers();
      if (opts.focus) {
        setTimeout(function () { try { panelParts.textarea.focus(); } catch (err) { /* ignore */ } }, 0);
      }
      return true;
    }

    function closePanel() {
      if (!panelEl) return false;
      panelOpen = false;
      panelEl.style.display = 'none';
      composing.quote = '';
      if (panelParts && panelParts.textarea) panelParts.textarea.value = '';
      return true;
    }

    function isPanelOpen() {
      return !!(panelEl && panelOpen);
    }

    function togglePanel(options) {
      var opts = options || {};
      if (panelOpen && (!opts.sessionId || opts.sessionId === view.sessionId)
          && (!opts.file || opts.file === view.file)) { closePanel(); return false; }
      return openPanel(opts);
    }

    function relPathOf(path) {
      if (!path || !view.cwd) return path || '';
      var root = String(view.cwd).replace(/[/\\]+$/, '');
      var full = String(path);
      if (full === root) return '';
      if (full.indexOf(root + '/') === 0 || full.indexOf(root + '\\') === 0) {
        return full.slice(root.length + 1);
      }
      return full;
    }

    function setViewFile(path, rel) {
      if (view.file !== (path || null)) resetInteraction();
      view.file = path || null;
      view.rel = rel || relPathOf(path);
      composing.path = view.file;
      composing.rel = view.rel;
    }

    function commitCompose() {
      if (!panelParts) return null;
      var text = panelParts.textarea.value.trim();
      if (text === '' && composing.quote === '') return null;
      var path = composing.path || view.file;
      if (!path) return null;
      var record = addAnnotation(view.cwd, {
        path: path,
        rel: composing.rel || relPathOf(path),
        quote: composing.quote,
        comment: text
      });
      panelParts.textarea.value = '';
      composing.quote = '';
      rerender();
      flash(t('saved'));
      return record;
    }

    /** Compatibility action: focus the resident composer; never marks notes sent. */
    function sendAll() { return focusPending(); }

    /** Paint the list + footer state from the store. */
    function rerender() {
      if (!panelEl || !panelParts) return;
      var cwd = view.cwd;
      var list = visibleOf(cwd).filter(function (item) { return item.sentAt || item.detached || !item.sessionId || item.sessionId !== view.sessionId; });
      var pending = unsentOf(cwd).length;
      panelParts.sub.textContent = list.length === 0 ? '' : t('panelCount', { n: list.length, m: pending });
      if (panelParts.scopeBtn) panelParts.scopeBtn.textContent = scope === 'session' ? t('scopeSession') : t('scopeAll');
      panelParts.target.textContent = '';
      panelParts.target.style.display = 'none';
      panelParts.textarea.placeholder = t('composePlaceholder', {
        file: composing.rel || relPathOf(view.file) || t('composeWholeFile')
      });
      panelParts.save.disabled = !view.file;

      var listEl = panelParts.list;
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

      if (list.length === 0) {
        listEl.style.display = 'none';
        return;
      }
      listEl.style.display = '';

      var groups = Object.create(null);
      var order = [];
      list.forEach(function (item) {
        var key = item.rel || item.path;
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(item);
      });

      order.forEach(function (key) {
        var group = element('div', 'group');
        var bar = element('div', 'filebar', key);
        bar.title = groups[key][0].path;
        group.appendChild(bar);
        groups[key].forEach(function (item) { group.appendChild(renderItem(item)); });
        listEl.appendChild(group);
      });
    }

    function renderItem(item) {
      var row = element('div', 'item');
      if (item.sentAt) row.setAttribute('data-sent', '1');
      if (item.quote) row.appendChild(element('span', 'quote', item.quote));
      row.appendChild(element('span', 'comment', item.comment || t('noComment')));
      var tagLabel = item.region
        ? (item.region.kind === 'pdf' ? t('regionTagPage', { n: item.region.page || 1 })
          : item.region.kind === 'html' ? t('regionTagFrame') : t('regionTagImage'))
        : item.quote ? t('quoteTag') : t('fileTag');
      if (item.htmlAnchor && item.region) tagLabel = t(item.htmlAnchor.kind === 'element' ? 'htmlElement' : 'htmlRegion');
      var tag = element('span', 'tag', tagLabel);
      if (item.sentAt) tag.textContent += ' · ' + t('sentTag');
      if (scope === 'all') {
        var owner = typeof item.sessionId === 'string' ? item.sessionId : '';
        var mine = view.sessionId || '';
        if (owner === '' || owner !== mine) {
          var ownerTag = element('span', 'tag', owner === '' ? t('ownerUnknown') : t('ownerOther'));
          row.appendChild(ownerTag);
        }
      }
      row.appendChild(tag);
      if (!item.sentAt && (item.detached || item.sessionId !== view.sessionId) && view.sessionId) {
        var destination = view.sessionId, cwd = view.cwd;
        row.appendChild(button('scope', t(item.sessionId === view.sessionId ? 'requeue' : 'adopt'), function () {
          if (view.sessionId === destination && view.cwd === cwd) adoptAnnotation(cwd, item.id, destination);
        }));
      }
      row.appendChild(button('del', '×', function () {
        if (view.cwd) removeAnnotation(view.cwd, item.id);
      }, t('remove')));
      return row;
    }

    // ======================================================================
    // 七·五、框选区域批注（PDF / 图片 / HTML）
    // ======================================================================

    var captureHint = null;
    var captureLayers = [];
    var captureObserver = null;
    var capturePointer = null;
    var regionSelect = null;
    var dragStart = null;
    var regionMode = false;
    var regionPane = null;
    var pointerDown = false;

    /** What kind of preview is on screen right now. */
    function previewKind() {
      var pane = paneElement();
      if (!pane) return null;
      if (carriers().some(function (carrier) { return carrier.kind === 'pdf'; })) return 'pdf';
      if (pane.querySelector('iframe')) return 'html';
      var box = paneBox();
      var imgs = pane.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i += 1) {
        var rect = imgs[i].getBoundingClientRect ? imgs[i].getBoundingClientRect() : null;
        if (!rect || rect.width < 80) continue;
        if (box && rect.width < box.width * 0.45) continue;
        return 'image';
      }
      return 'text';
    }

    function regionCapable() {
      var kind = previewKind();
      return kind === 'pdf' || kind === 'image' || kind === 'html';
    }

    /**
     * Everything a box can be measured against, in paint order. The box engine
     * measure pages by the renderer's page identity, not their position in a
     * NodeList: PDF canvases mount lazily and need not start at page one.
     */
    function carriers() {
      var pane = paneElement();
      var out = [];
      if (!pane) return out;
      var canvases = pane.querySelectorAll('canvas');
      var hasPageIds = !!pane.querySelector('[data-pdf-page]');
      for (var i = 0; i < canvases.length; i += 1) {
        var pageEl = canvases[i].closest('[data-pdf-page]');
        // Ignore spreadsheet/chart/scratch canvases. The current PDF renderer
        // exposes page wrappers; the extension is a fallback for older hosts.
        if (hasPageIds ? !pageEl : !/\.pdf$/i.test(view.file || '')) continue;
        var page = pageEl ? Number(pageEl.getAttribute('data-pdf-page')) : i + 1;
        out.push({ el: canvases[i], kind: 'pdf', page: page > 0 ? page : i + 1 });
      }
      var frame = pane.querySelector('iframe');
      if (frame) out.push({ el: frame, kind: 'html', page: 1 });
      var box = paneBox();
      var imgs = pane.querySelectorAll('img');
      for (var j = 0; j < imgs.length; j += 1) {
        var r = imgs[j].getBoundingClientRect ? imgs[j].getBoundingClientRect() : null;
        if (!r || r.width < 80) continue;
        if (box && r.width < box.width * 0.45) continue;
        out.push({ el: imgs[j], kind: 'image', page: 0 });
      }
      return out;
    }

    /** Smallest carrier under one point (one page, not the whole scroll column). */
    function carrierAt(x, y) {
      var best = null;
      var bestArea = Infinity;
      carriers().forEach(function (carrier) {
        var rect = carrier.el.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
        var area = rect.width * rect.height;
        if (area > 0 && area < bestArea) {
          best = carrier;
          bestArea = area;
        }
      });
      return best;
    }

    function indexOfNode(list, node) {
      for (var i = 0; i < list.length; i += 1) if (list[i] === node) return i;
      return 0;
    }

    /** Clamp a dragged rectangle to normalized coordinates inside the carrier. */
    function normalizeDrag(targetRect, from, to) {
      if (!targetRect || targetRect.width <= 0 || targetRect.height <= 0) return null;
      var x1 = Math.min(from.x, to.x);
      var y1 = Math.min(from.y, to.y);
      var x2 = Math.max(from.x, to.x);
      var y2 = Math.max(from.y, to.y);
      var clamp = function (v) { return Math.min(1, Math.max(0, v)); };
      var left = clamp((x1 - targetRect.left) / targetRect.width);
      var top = clamp((y1 - targetRect.top) / targetRect.height);
      var right = clamp((x2 - targetRect.left) / targetRect.width);
      var bottom = clamp((y2 - targetRect.top) / targetRect.height);
      if (right - left < 0.01 || bottom - top < 0.01) return null;
      return { x: left, y: top, w: right - left, h: bottom - top };
    }

    /** Crop the boxed area of a canvas/img into a PNG data URL. */
    function cropDataUrl(target, norm) {
      if (!target || !norm) return null;
      if (target.kind === 'html') return null;
      var src = target.el;
      var naturalW = src.tagName.toLowerCase() === 'canvas' ? src.width : (src.naturalWidth || src.width);
      var naturalH = src.tagName.toLowerCase() === 'canvas' ? src.height : (src.naturalHeight || src.height);
      if (!naturalW || !naturalH) return null;
      var sx = Math.floor(norm.x * naturalW);
      var sy = Math.floor(norm.y * naturalH);
      var sw = Math.max(1, Math.floor(norm.w * naturalW));
      var sh = Math.max(1, Math.floor(norm.h * naturalH));
      try {
        var canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        var context = canvas.getContext && canvas.getContext('2d');
        if (!context) return null;
        context.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
        return canvas.toDataURL('image/png');
      } catch (err) {
        return null;
      }
    }

    function clearCaptureLayers() {
      captureLayers.forEach(function (layer) {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      });
      captureLayers = [];
    }

    /** Only the visible part of a carrier may intercept a drag, never the header. */
    function visibleCarrierRect(el) {
      var raw = el.getBoundingClientRect();
      var pane = paneBox();
      if (!pane || raw.width <= 0 || raw.height <= 0) return null;
      var left = Math.max(0, raw.left, pane.left);
      var top = Math.max(0, raw.top, pane.top);
      var right = Math.min(window.innerWidth, raw.right, pane.right);
      var bottom = Math.min(window.innerHeight, raw.bottom, pane.bottom);
      // A zoomed/scrolled page can extend underneath the PDF toolbar. Respect
      // every clipping ancestor instead of covering the obscured part of it.
      for (var node = el.parentElement; node; node = node.parentElement) {
        if (typeof window.getComputedStyle !== 'function') break;
        var style = window.getComputedStyle(node);
        var rect = node.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, rect.left); right = Math.min(right, rect.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom);
        }
      }
      return right > left && bottom > top
        ? { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top }
        : null;
    }

    function syncCaptureLayers() {
      if (!regionMode || dragStart || inlineEl) return;
      clearCaptureLayers();
      if (activeHtmlEntry()) return;
      carriers().forEach(function (carrier) {
        // PDF canvas/text layers live in this document: capture-phase pointer
        // handlers can draw directly on them. An overlay would become the wheel
        // target outside the PDF scroller and swallow ordinary scrolling.
        if (carrier.kind === 'pdf') return;
        var rect = visibleCarrierRect(carrier.el);
        if (!rect) return;
        // iframe events never bubble into the parent. A surface over just the
        // rendered content handles frames and PDF text layers in the same way.
        var layer = element('div', 'capture');
        layer.style.left = rect.left + 'px'; layer.style.top = rect.top + 'px';
        layer.style.width = rect.width + 'px'; layer.style.height = rect.height + 'px';
        layer.__annotationCarrier = carrier;
        document.body.appendChild(layer);
        captureLayers.push(layer);
      });
    }

    function removeCapture() {
      htmlFrames.forEach(function (entry) { if (entry.ready) entry.send({type:'mode',mode:'none'}); });
      if (captureObserver) { captureObserver.disconnect(); captureObserver = null; }
      if (capturePointer) {
        try { capturePointer.el.releasePointerCapture(capturePointer.id); } catch (err) { /* already released */ }
        capturePointer = null;
      }
      clearCaptureLayers();
      [captureHint, regionSelect].forEach(function (node) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      });
      captureHint = null;
      regionSelect = null;
      dragStart = null;
      var pane = regionPane || paneElement();
      regionPane = null;
      if (pane && pane.style) { pane.style.cursor = ''; pane.removeAttribute('data-dsh-annotation-pdf-box'); }
    }

    function setRegionMode(next, mode) {
      hideHtmlMenu();
      removeCapture();
      regionMode = next === true;
      htmlPickMode = mode === 'element' ? 'element' : 'box';
      bump();
      if (!regionMode) return false;
      hideSelectionAction();
      hideInline();
      if (!paneElement()) { regionMode = false; bump(); return false; }
      var pane = paneElement();
      regionPane = pane;
      if (pane && pane.style) pane.style.cursor = 'crosshair';
      if (pane && previewKind() === 'pdf') pane.setAttribute('data-dsh-annotation-pdf-box', '');
      var html = activeHtmlEntry();
      if (html) html.send({type:'mode',mode:htmlPickMode});
      syncCaptureLayers();
      if (typeof window.MutationObserver === 'function') {
        captureObserver = new window.MutationObserver(function () { syncCaptureLayers(); });
        captureObserver.observe(pane, { childList: true, subtree: true, attributes: true,
          attributeFilter: ['width', 'height', 'hidden', 'data-pdf-page', 'style'] });
      }
      var box = paneBox();
      if (box) {
        captureHint = element('div', 'captureHint', t(htmlPickMode === 'element' ? 'elementHint' : 'regionHint'));
        captureHint.style.left = box.left + 12 + 'px';
        captureHint.style.top = box.top + 12 + 'px';
        document.body.appendChild(captureHint);
      }
      return true;
    }

    /** Hit-test the press; a click on the header or a control must not start a box. */
    function beginRegionDrag(x, y, target) {
      if (inlineEl) return false;
      var carrier = target || carrierAt(x, y);
      if (!carrier) return false;
      dragStart = { x: x, y: y, carrier: carrier };
      regionSelect = element('div', 'regionSel');
      document.body.appendChild(regionSelect);
      positionRegionSelect(x, y);
      return true;
    }

    function positionRegionSelect(endX, endY) {
      if (!regionSelect || !dragStart) return;
      var left = Math.min(dragStart.x, endX);
      var top = Math.min(dragStart.y, endY);
      regionSelect.style.left = left + 'px';
      regionSelect.style.top = top + 'px';
      regionSelect.style.width = Math.abs(endX - dragStart.x) + 'px';
      regionSelect.style.height = Math.abs(endY - dragStart.y) + 'px';
    }

    function finishRegionDrag(x, y) {
      if (!dragStart) return false;
      var from = dragStart;
      var carrier = from.carrier;
      dragStart = null;
      var rect = carrier.el.getBoundingClientRect();
      var norm = normalizeDrag(rect, { x: from.x, y: from.y }, { x: x, y: y });
      var continuous = carrier.kind === 'pdf' && regionMode;
      if (!continuous) setRegionMode(false);
      removeCapture();
      if (!norm) { if (continuous) setRegionMode(true); return false; }
      openRegionComposer({ target: carrier, norm: norm }, {
        left: Math.min(from.x, x),
        top: Math.min(from.y, y),
        right: Math.max(from.x, x),
        bottom: Math.max(from.y, y),
        width: Math.abs(x - from.x),
        height: Math.abs(y - from.y)
      });
      return true;
    }

    /** Compose a note for a boxed region. */
    function openRegionComposer(context, screenRect) {
      var label = context.target.kind === 'pdf'
        ? t('regionPage', { n: context.target.page })
        : context.target.kind === 'html' ? t('regionFrame') : '';
      showInline(screenRect, label, {
        kind: context.target.kind,
        page: context.target.page,
        x: context.norm.x,
        y: context.norm.y,
        w: context.norm.w,
        h: context.norm.h,
        target: context.target
      });
    }
    // ======================================================================
    // 八、常驻标记层 + 选中就地输入
    // ======================================================================

    var markerLayer = null;
    var markerList = [];
    var tipEl = null;
    var inlineEl = null;
    var inlineInput = null;
    var inlineQuoteEl = null;
    var inlineTarget = null;
    var draftRegion = null;
    var selectionAction = null;
    var selectionTarget = null;
    var selectionToolbar = null;
    var selectionPeer = null;
    var selectionToolbarPressed = false;
    var htmlToolMenu = null;
    var htmlMenuAnchor = null;
    var inlineSaving = false;

    function normalizeSpace(text) {
      return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    }

    function paneElement() {
      if (view.pane && document.body.contains(view.pane) && nodeVisible(view.pane)) return view.pane;
      var panes = document.querySelectorAll(SIDEBAR_PANE_SELECTOR);
      for (var i = 0; i < panes.length; i += 1) if (nodeVisible(panes[i])) return panes[i];
      return null;
    }

    function nodeVisible(node) {
      for (var el = node; el; el = el.parentElement) {
        if (el.getAttribute && el.getAttribute('hidden') != null) return false;
        // Closing has an animated transform before visibility becomes hidden.
        // Use the host's open flag immediately instead of painting stale badges.
        if (el.getAttribute && el.getAttribute('data-sidebar-right-panel') != null
            && el.getAttribute('data-sidebar-right-open') == null) return false;
        if (typeof window.getComputedStyle === 'function') {
          var style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
        }
      }
      return true;
    }

    function mountedSession(fallback) {
      var nav = composerRuntime && composerRuntime.sidebarRight;
      return nav && nav.mounted ? (nav.mounted.getSnapshot() || null) : fallback;
    }

    function relativeFor(path, cwd) {
      var root = (cwd || '').replace(/[/\\]+$/, '');
      return root && (path.indexOf(root + '/') === 0 || path.indexOf(root + '\\') === 0) ? path.slice(root.length + 1) : path;
    }

    /** File address provenance is independent of the conversation receiving notes. */
    function activatePreview(node) {
      var el = node && node.nodeType === 1 ? node : node && node.parentElement;
      var pane = el && el.closest ? el.closest(SIDEBAR_PANE_SELECTOR) : null;
      if (!pane || !nodeVisible(pane)) return false;
      var actions = pane.querySelectorAll('[' + MARK + '="action"]');
      var owner = null;
      for (var i = 0; i < actions.length; i += 1) {
        if (nodeVisible(actions[i]) && (actions[i].getAttribute('data-annotation-file') || actions[i].getAttribute('data-annotation-root'))) {
          owner = actions[i]; break;
        }
      }
      // Legacy/test previews without our metadata may still use an explicit view.
      if (!owner) { view.pane = pane; maybeApplyPdfDefault(); return !!view.file; }
      var sessionId = mountedSession(owner.getAttribute('data-annotation-owner'));
      if (!sessionId) return false;
      var file = owner.getAttribute('data-annotation-file');
      setViewSession(sessionId);
      view.pane = pane;
      view.cwd = cachedCwd(sessionId) || (owner.getAttribute('data-annotation-owner') === sessionId ? owner.getAttribute('data-annotation-root') : null);
      if (view.file !== file) resetInteraction();
      setViewFile(file || null, file ? relativeFor(file, view.cwd) : null);
      if (view.cwd) rememberCwd(sessionId, view.cwd);
      else resolveCwd(sessionId).then(function (cwd) {
        if (!cwd || view.sessionId !== sessionId || view.file !== file || view.pane !== pane) return;
        view.cwd = cwd; view.rel = file ? relativeFor(file, cwd) : null;
        bump(); rerender(); syncMarkers();
      });
      trackPreviewLifetime(owner);
      maybeApplyPdfDefault();
      return true;
    }

    /**
     * The pane's real box. The slot outlet itself is `display: contents` and has a
     * zero rect, so walk up (then fall back to the dock panel) before measuring.
     */
    function paneBox() {
      var node = paneElement();
      for (var depth = 0; node && depth < 6; depth += 1) {
        if (typeof node.getBoundingClientRect === 'function') {
          var rect = node.getBoundingClientRect();
          if (rect && rect.width > 0 && rect.height > 0) return rect;
        }
        node = node.parentElement;
      }
      var panel = document.querySelector('[data-sidebar-right-panel]');
      if (panel && typeof panel.getBoundingClientRect === 'function') {
        var panelRect = panel.getBoundingClientRect();
        if (panelRect && panelRect.width > 0) return panelRect;
      }
      return null;
    }

    function matchText(text) { return String(text || '').replace(/[\s\u200b\u00ad\ufeff]/g, ''); }

    /** Map a whitespace-normalized stream back to the original DOM endpoints. */
    function textIndex(root) {
      if (!root || typeof document.createTreeWalker !== 'function') return null;
      var walker = document.createTreeWalker(root, 4, null);
      var entries = [], parts = [], length = 0, node;
      while ((node = walker.nextNode())) {
        var el = node.parentElement;
        if (!el || ownsNode(el) || !nodeVisible(el) || el.closest('script, style, button, textarea, input, select')) continue;
        var raw = node.nodeValue || '', positions = [], chars = [];
        for (var i = 0; i < raw.length; i += 1) if (!/[\s\u200b\u00ad\ufeff]/.test(raw[i])) { positions.push(i); chars.push(raw[i]); }
        if (!positions.length) continue;
        var text = chars.join('');
        entries.push({ node: node, start: length, end: length + text.length, positions: positions });
        parts.push(text); length += text.length;
      }
      return { root: root, text: parts.join(''), entries: entries };
    }

    function textRoot(node, page) {
      var pane = paneElement();
      if (!pane) return null;
      if (page) return pane.querySelector('[data-pdf-page="' + page + '"]');
      var el = node && node.nodeType === 1 ? node : node && node.parentElement;
      return el && el.closest('[data-pdf-page], [data-textpreview-plain], [data-code-preview], .cm-content, [data-annotation-text]')
        || Array.prototype.slice.call(pane.querySelectorAll('.cm-content, [data-annotation-text], [data-textpreview-body]')).find(nodeVisible) || pane;
    }

    function captureTextAnchor(range, quote) {
      var root = textRoot(range.startContainer || range.commonAncestorContainer);
      var index = textIndex(root);
      if (!index) return null;
      var start = null;
      index.entries.some(function (entry) {
        if (entry.node !== range.startContainer) return false;
        start = entry.start + matchText(entry.node.nodeValue.slice(0, range.startOffset)).length; return true;
      });
      var exact = matchText(quote);
      if (start == null || !exact || index.text.slice(start, start + exact.length) !== exact) return null;
      var anchor = { start: start, end: start + exact.length, prefix: index.text.slice(Math.max(0, start - 64), start), suffix: index.text.slice(start + exact.length, start + exact.length + 64) };
      var page = root.getAttribute && Number(root.getAttribute('data-pdf-page'));
      if (page > 0) anchor.page = page;
      return anchor;
    }

    function textMatch(index, quote, anchor) {
      var needle = matchText(quote);
      if (!index || !needle) return null;
      var best = null, score = -Infinity, from = 0;
      while (from <= index.text.length) {
        var at = index.text.indexOf(needle, from);
        if (at < 0) break;
        var value = 0;
        if (anchor) {
          if (anchor.prefix && index.text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix) value += 100;
          if (anchor.suffix && index.text.slice(at + needle.length, at + needle.length + anchor.suffix.length) === anchor.suffix) value += 100;
          value -= Math.min(50, Math.abs(at - anchor.start) / 100);
        }
        if (value > score) { score = value; best = { start: at, end: at + needle.length }; }
        from = at + 1;
      }
      return best;
    }

    function rangeFromMatch(index, found) {
      if (!found) return null;
      var first = index.entries.find(function (entry) { return entry.start <= found.start && entry.end > found.start; });
      var last = index.entries.find(function (entry) { return entry.start < found.end && entry.end >= found.end; });
      if (!first || !last || typeof document.createRange !== 'function') return null;
      try {
        var range = document.createRange();
        range.setStart(first.node, first.positions[found.start - first.start]);
        range.setEnd(last.node, last.positions[found.end - last.start - 1] + 1);
        return range;
      } catch (error) { return null; }
    }

    function quoteRects(item, cache) {
      var pane = paneElement();
      var root = textRoot(null, item.anchor && item.anchor.page);
      if (!pane || !root) return [];
      var index = cache.get(root);
      if (!index) { index = textIndex(root); cache.set(root, index); }
      var range = rangeFromMatch(index, textMatch(index, item.quote, item.anchor));
      if (!range) return [];
      var visible = visibleCarrierRect(root) || paneBox();
      if (!visible) return [];
      var rects = typeof range.getClientRects === 'function' ? Array.prototype.slice.call(range.getClientRects()) : [range.getBoundingClientRect()];
      return rects.map(function (rect) {
        var left = Math.max(rect.left, visible.left), top = Math.max(rect.top, visible.top);
        var right = Math.min(rect.right, visible.right), bottom = Math.min(rect.bottom, visible.bottom);
        return right > left && bottom > top ? { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top } : null;
      }).filter(Boolean);
    }

    function ensureMarkerLayer() {
      if (markerLayer) return markerLayer;
      markerLayer = element('div', 'marks');
      document.body.appendChild(markerLayer);
      return markerLayer;
    }

    function removeTip() {
      if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
      tipEl = null;
    }

    function showTip(anchorEl, item) {
      removeTip();
      tipEl = element('div', 'marktip');
      var quoted = normalizeSpace(item.quote);
      if (quoted) {
        var q = element('div', 'inlineQuote', quoted.slice(0, 160));
        tipEl.appendChild(q);
      }
      tipEl.appendChild(element('div', 'comment', item.comment || t('noComment')));
      document.body.appendChild(tipEl);
      var rect = anchorEl.getBoundingClientRect();
      var left = Math.min(window.innerWidth - 268, Math.max(8, rect.left - 226));
      var top = Math.min(window.innerHeight - 80, rect.bottom + 8);
      tipEl.style.left = left + 'px';
      tipEl.style.top = top + 'px';
    }

    /**
     * Repaint the always-on marker layer: one numbered badge per note of the file
     * currently on screen. Quotes are anchored to their text; notes whose quote is
     * not on screen (paged preview, PDF canvas) ride a fixed rail on the pane edge.
     */
    function syncMarkers() {
      if (!markerLayer) {
        if (!installed) return;
        ensureMarkerLayer();
      }
      while (markerLayer.firstChild) markerLayer.removeChild(markerLayer.firstChild);
      markerList = [];
      if (!installed || !view.cwd || !view.file || !paneElement()) return;
      var paneRect = paneBox();
      if (!paneRect) return;
      var items = visibleOf(view.cwd).filter(function (item) { return item.path === view.file; });
      if (items.length === 0) return;
      var railTop = paneRect.top + 46;
      var railLeft = paneRect.right - 26;
      var indexes = new Map();
      for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        var label = String(i + 1);
        var badge = element('button', 'mark', label);
        badge.type = 'button';
        if (item.sentAt) badge.setAttribute('data-sent', '1');
        badge.title = item.comment || '';
        (function (current, marker) {
          badge.addEventListener('mouseenter', function () { showTip(marker, current); });
          badge.addEventListener('mouseleave', removeTip);
          badge.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            removeTip();
            openPanel({ cwd: view.cwd, sessionId: view.sessionId, file: view.file, rel: view.rel });
          });
        })(item, badge);
        markerLayer.appendChild(badge);
        if (item.htmlAnchor) {
          var parts = htmlRects(item);
          if (!parts.length) { markerLayer.removeChild(badge); continue; }
          parts.forEach(function (part) {
            var highlight = element('div',item.htmlAnchor.kind === 'text' ? 'textHighlight' : 'regionBox');
            highlight.style.left = part.left+'px'; highlight.style.top = part.top+'px';
            highlight.style.width = part.width+'px'; highlight.style.height = part.height+'px'; markerLayer.appendChild(highlight);
          });
          var last = parts[parts.length-1];
          badge.style.left = Math.max(paneRect.left,last.right-24)+'px';
          badge.style.top = Math.max(paneRect.top,last.top-10)+'px';
          markerList.push({el:badge,item:item}); continue;
        }
        if (item.region && !(item.region.kind === 'html' && activeHtmlEntry())) {
          var carrier = carrierForRegion(item.region);
          if (carrier) {
            var carRect = carrier.getBoundingClientRect();
            var visible = visibleCarrierRect(carrier);
            var x1 = carRect.left + item.region.x * carRect.width;
            var y1 = carRect.top + item.region.y * carRect.height;
            var x2 = x1 + item.region.w * carRect.width;
            var y2 = y1 + item.region.h * carRect.height;
            // A fixed annotation must not float over the toolbar when its page
            // scrolls out of the document viewport.
            if (!visible || x2 <= visible.left || x1 >= visible.right || y2 <= visible.top || y1 >= visible.bottom) {
              markerLayer.removeChild(badge);
              continue;
            }
            x1 = Math.max(x1, visible.left); y1 = Math.max(y1, visible.top);
            x2 = Math.min(x2, visible.right); y2 = Math.min(y2, visible.bottom);
            var boxEl = element('div', 'regionBox');
            boxEl.style.left = x1 + 'px'; boxEl.style.top = y1 + 'px';
            boxEl.style.width = x2 - x1 + 'px'; boxEl.style.height = y2 - y1 + 'px';
            markerLayer.appendChild(boxEl);
            badge.style.left = Math.max(visible.left, x2 - 24) + 'px';
            badge.style.top = Math.max(visible.top, y1 - 10) + 'px';
            markerList.push({ el: badge, item: item });
            continue;
          }
        }
        var rects = item.quote ? quoteRects(item, indexes) : [];
        var rect = rects.length ? rects[rects.length - 1] : null;
        if (item.quote && !rect) { markerLayer.removeChild(badge); continue; }
        if (rect) {
          rects.forEach(function (part) {
            var highlight = element('div', 'textHighlight');
            highlight.style.left = part.left + 'px'; highlight.style.top = part.top + 'px';
            highlight.style.width = part.width + 'px'; highlight.style.height = part.height + 'px';
            markerLayer.appendChild(highlight);
          });
          var left = Math.min(paneRect.right - 26, rect.right + 5);
          badge.style.left = Math.max(4, left) + 'px';
          badge.style.top = Math.max(4, rect.top + rect.height / 2 - 9.5) + 'px';
        } else {
          badge.style.left = Math.max(4, railLeft) + 'px';
          badge.style.top = Math.max(4, railTop) + 'px';
          railTop += 24;
        }
        markerList.push({ el: badge, item: item });
      }
    }

    /** The element a stored region was measured against. */
    function carrierForRegion(region) {
      var pane = paneElement();
      if (!pane || !region) return null;
      if (region.kind === 'pdf') {
        var pages = carriers();
        for (var p = 0; p < pages.length; p += 1) {
          if (pages[p].kind === 'pdf' && pages[p].page === (region.page || 1)) return pages[p].el;
        }
        return null;
      }
      if (region.kind === 'image') {
        var box = paneBox();
        var imgs = pane.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i += 1) {
          var r = imgs[i].getBoundingClientRect();
          if (box && r.width < box.width * 0.45) continue;
          return imgs[i];
        }
        return null;
      }
      return pane.querySelector('iframe');
    }

    function clearMarkers() {
      removeTip();
      if (markerLayer) {
        while (markerLayer.firstChild) markerLayer.removeChild(markerLayer.firstChild);
      }
      markerList = [];
    }

    // ── 选中文字 → 批注选项 → 就地输入 ────────────────────────────────────

    function ownsNode(node) {
      for (var el = node && node.nodeType === 1 ? node : node && node.parentElement; el; el = el.parentElement) {
        if (el.getAttribute && (el.getAttribute(MARK) != null || el === selectionPeer)) return true;
      }
      return false;
    }

    function editableNode(node) {
      var el = node && node.nodeType === 1 ? node : node && node.parentElement;
      return el && el.closest && el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
    }

    function selectionInsideSidebar(selection) {
      if (!selection || selection.rangeCount === 0) return null;
      var range = selection.getRangeAt(0);
      if (range.collapsed) return null;
      var node = range.commonAncestorContainer;
      var el = node && node.nodeType === 1 ? node : (node ? node.parentElement : null);
      if (!el || typeof el.closest !== 'function') return null;
      if (!el.closest(SIDEBAR_PANE_SELECTOR)) return null;
      if (!nodeVisible(el) || ownsNode(el)) return null;
      // File code viewers can use a readonly contenteditable surface. Ordinary
      // forms/search fields remain excluded; extension names do not decide it.
      if (editableNode(el) && (!el.closest('[data-code-preview], [data-textpreview-plain], [data-annotation-preview] .cm-content') || el.closest('input, textarea, select'))) return null;
      var text = String(selection.toString() || '').trim();
      if (text.length === 0) return null;
      return { range: range, text: text };
    }

    function hideSelectionAction() {
      if (selectionPeer) {
        selectionPeer.removeAttribute('data-dsh-file-annotations-peer');
        ['left', 'top', 'width'].forEach(function (key) { selectionPeer.style.removeProperty('--dsh-note-peer-' + key); });
        selectionPeer.removeEventListener('click', hideSelectionAction);
      }
      if (selectionToolbar && selectionToolbar.parentNode) selectionToolbar.parentNode.removeChild(selectionToolbar);
      if (selectionAction && selectionAction.parentNode) selectionAction.parentNode.removeChild(selectionAction);
      selectionPeer = null;
      selectionToolbar = null;
      selectionToolbarPressed = false;
      selectionAction = null;
      selectionTarget = null;
    }

    /**
     * Better Sidebar 0.28 has no public selection-action extension point. Keep
     * its React portal, click handler and line-aware insertion intact; position
     * that button over a reserved cell in our shared toolbar. Never reparent a
     * React-owned node or inspect its private props/classes. This DOM adapter
     * is limited to a live selection in our wrapped text viewer and the known
     * zh/en action label. An unknown renderer/locale retains separate actions.
     */
    function syncSelectionToolbar() {
      if (!selectionAction || !selectionTarget || !selectionTarget.betterSelection) return;
      if (selectionPeer) {
        // Its outside-mousedown handler dismisses the native portal before our
        // Note click. Keep the pressed button mounted until that click opens
        // the editor, otherwise the browser drops the click altogether.
        if (!document.body.contains(selectionPeer) && !selectionToolbarPressed) hideSelectionAction();
        return;
      }
      var candidates = Array.prototype.filter.call(document.body.children || [], function (node) {
        if (node.tagName !== 'BUTTON' || ownsNode(node) || node.type !== 'button') return false;
        if (!/^(添加到对话|Add to conversation)$/.test(String(node.textContent || '').trim())) return false;
        return window.getComputedStyle(node).position === 'fixed' && nodeVisible(node);
      });
      if (candidates.length !== 1) return;
      var peer = candidates[0];
      var peerWidth = Math.ceil(peer.getBoundingClientRect().width);
      if (!peerWidth || peerWidth > window.innerWidth - 100) return;
      selectionPeer = peer;
      selectionToolbar = element('div', 'selectionTools');
      selectionToolbar.setAttribute('role', 'toolbar');
      selectionToolbar.setAttribute('aria-label', currentLang() === 'zh' ? '选区操作' : 'Selection actions');
      selectionToolbar.appendChild(selectionAction);
      var cell = element('span', 'selectionPeerCell');
      cell.style.width = peerWidth + 'px'; cell.style.height = '28px';
      selectionToolbar.appendChild(cell);
      document.body.appendChild(selectionToolbar);
      var width = selectionToolbar.offsetWidth || peerWidth + 110;
      placeInlineSurface(selectionToolbar, selectionTarget.rect, width, 30);
      var rect = selectionToolbar.getBoundingClientRect();
      peer.style.setProperty('--dsh-note-peer-left', rect.left + width - peerWidth - 1 + 'px');
      peer.style.setProperty('--dsh-note-peer-top', rect.top + 1 + 'px');
      peer.style.setProperty('--dsh-note-peer-width', peerWidth + 'px');
      peer.setAttribute('data-dsh-file-annotations-peer', 'selection');
      peer.addEventListener('click', hideSelectionAction);
    }

    function resetInteraction() {
      pdfDefaultVisit = null;
      hideHtmlMenu();
      if (selectionTimer) { clearTimeout(selectionTimer); selectionTimer = null; }
      pointerDown = false;
      hideSelectionAction();
      hideInline();
      if (regionMode) setRegionMode(false);
    }

    function setViewSession(sessionId) {
      if (view.sessionId !== sessionId) {
        resetInteraction();
        closePanel();
        composing.quote = '';
        if (panelParts) panelParts.textarea.value = '';
        view.cwd = null;
        scope = 'session';
      }
      view.sessionId = sessionId;
    }

    /** Accept both DOMRects and constructed drag rectangles; never write NaNpx. */
    function placeInlineSurface(el, rect, width, height) {
      var left = Number.isFinite(rect.left) ? rect.left : 8;
      var top = Number.isFinite(rect.top) ? rect.top : 8;
      var bottom = Number.isFinite(rect.bottom) ? rect.bottom : top + (rect.height || 0);
      var maxLeft = Math.max(8, window.innerWidth - width - 8);
      var maxTop = Math.max(8, window.innerHeight - height - 8);
      el.style.left = Math.max(8, Math.min(maxLeft, left)) + 'px';
      var below = bottom + 8;
      el.style.top = Math.max(8, Math.min(maxTop, below > maxTop ? top - height - 8 : below)) + 'px';
    }

    function hideInline(resume) {
      var previous = inlineTarget;
      if (draftRegion && draftRegion.parentNode) draftRegion.parentNode.removeChild(draftRegion);
      draftRegion = null;
      if (inlineEl && inlineEl.parentNode) inlineEl.parentNode.removeChild(inlineEl);
      inlineEl = null;
      inlineInput = null;
      inlineQuoteEl = null;
      inlineTarget = null;
      inlineSaving = false;
      syncHtmlNotes();
      if (resume && previous && previous.continuousBox && regionMode && view.file === previous.path && view.sessionId === previous.sessionId && paneElement()) {
        setRegionMode(true);
      }
    }

    function syncDraftRegion() {
      if (draftRegion && draftRegion.parentNode) draftRegion.parentNode.removeChild(draftRegion);
      draftRegion = null;
      if (inlineTarget && inlineTarget.htmlAnchor) {
        var entry = activeHtmlEntry();
        var htmlRect = htmlRects({id:'__draft'})[0] || (entry && !entry.geometry.has('__draft') ? inlineTarget.rect : null);
        if (htmlRect) {
          draftRegion = element('div','draftRegion');
          draftRegion.style.left = htmlRect.left+'px'; draftRegion.style.top = htmlRect.top+'px';
          draftRegion.style.width = htmlRect.width+'px'; draftRegion.style.height = htmlRect.height+'px';
          document.body.appendChild(draftRegion);
        }
        return;
      }
      var region = inlineTarget && inlineTarget.region;
      if (!region || !paneElement()) return;
      var carrier = carrierForRegion(region);
      if (!carrier) return;
      var rect = carrier.getBoundingClientRect();
      var visible = visibleCarrierRect(carrier);
      if (!visible) return;
      var left = Math.max(visible.left, rect.left + region.x * rect.width);
      var top = Math.max(visible.top, rect.top + region.y * rect.height);
      var right = Math.min(visible.right, rect.left + (region.x + region.w) * rect.width);
      var bottom = Math.min(visible.bottom, rect.top + (region.y + region.h) * rect.height);
      if (right <= left || bottom <= top) return;
      draftRegion = element('div', 'draftRegion');
      draftRegion.style.left = left + 'px'; draftRegion.style.top = top + 'px';
      draftRegion.style.width = right - left + 'px'; draftRegion.style.height = bottom - top + 'px';
      document.body.appendChild(draftRegion);
    }

    function saveInline(onSaved) {
      if (!inlineInput || inlineSaving) return false;
      var comment = inlineInput.value.trim();
      var target = inlineTarget;
      var cwd = target && target.cwd;
      if (comment === '' || !target) return false;
      inlineSaving = true;
      var finish = function (resolved) {
        if (!resolved) { inlineSaving = false; flash(t('noWorkspace')); return; }
        var region = target.region;
        var record = addAnnotation(resolved, {
          path: target.path,
          rel: target.rel,
          quote: target.quote,
          anchor: target.anchor,
          htmlAnchor: target.htmlAnchor,
          comment: comment,
          sessionId: target.sessionId,
          region: region ? {
            kind: region.kind,
            page: region.page,
            x: region.x, y: region.y, w: region.w, h: region.h
          } : null
        });
        // Workspace resolution can finish after the user changed conversations.
        // Persist to the original target without closing a newer draft.
        if (inlineTarget === target) hideInline(true);
        syncMarkers();
        var dataUrl = record && region ? cropDataUrl(region.target, region) : null;
        if (dataUrl) {
          cropPreviews.set(record.id, dataUrl);
          var cropJob = saveStore(resolved).then(function (ok) {
            if (!ok) throw new Error('annotation-not-persisted');
            return post(CROP_ROUTE, { cwd: resolved, id: record.id, dataUrl: dataUrl });
          })
          .then(function (value) {
            if (value && typeof value.rel === 'string') {
              record.crop = value.rel;
              var current = itemsOf(resolved).find(function (item) { return item.id === record.id; });
              if (current) current.crop = value.rel;
            }
            scheduleSave(resolved); bump();
            syncMarkers();
          })
          .catch(function () { /* the note stands on its own without the crop */ })
          .finally(function () { cropJobs.delete(record.id); });
          cropJobs.set(record.id, cropJob);
        }
        bump();
        if (record && typeof onSaved === 'function') onSaved(record, resolved);
      };
      if (cwd) finish(cwd);
      else resolveCwd(target.sessionId).then(finish);
      return true;
    }

    function showInline(rect, text, region, context) {
      hideSelectionAction();
      hideInline();
      if (!view.file) return;
      inlineEl = element('div', 'inline');
      inlineQuoteEl = element('div', 'inlineQuote', normalizeSpace(text).slice(0, 200));
      inlineInput = document.createElement('input');
      inlineInput.setAttribute(MARK, 'inlineInput');
      inlineInput.placeholder = t('inlinePlaceholder');
      inlineInput.addEventListener('keydown', function (event) {
        if (!event || event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') { event.preventDefault(); saveInline(); }
        if (event.key === 'Escape') { event.preventDefault(); hideInline(); }
      });
      var row = element('div', 'inlineRow');
      row.appendChild(button('ghost', t('inlineCancel'), function () { hideInline(true); }));
      row.appendChild(button('inlineSave', t('inlineSave'), function () { saveInline(); }, t('saveHint', { keys: submitKeys() })));
      inlineEl.appendChild(inlineQuoteEl);
      inlineEl.appendChild(inlineInput);
      inlineEl.appendChild(row);
      document.body.appendChild(inlineEl);
      inlineTarget = {
        quote: region ? '' : text, path: context ? context.path : view.file,
        rel: context ? context.rel : view.rel, cwd: context ? context.cwd : view.cwd,
        sessionId: context ? context.sessionId : view.sessionId, region: region || null,
        continuousBox: !!(region && region.kind === 'pdf' && regionMode)
      };
      if (context && context.anchor) inlineTarget.anchor = context.anchor;
      if (context && context.htmlAnchor) {
        inlineTarget.htmlAnchor = context.htmlAnchor;
        inlineTarget.quote = context.quote;
        inlineTarget.rect = rect;
      }
      syncHtmlNotes();
      syncDraftRegion();
      placeInlineSurface(inlineEl, rect, 264, inlineEl.offsetHeight || 120);
      try { inlineInput.focus(); } catch (err) { /* headless */ }
    }

    /**
     * Selection only offers an action. The editor opens after an explicit click;
     * reading/copying text must never steal focus or overwrite a draft.
     */
    function evaluateSelection() {
      if (pointerDown || regionMode || inlineEl) return false;
      var selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
      var found = selectionInsideSidebar(selection);
      if (!found) { hideSelectionAction(); return false; }
      activatePreview(found.range.commonAncestorContainer);
      if (!view.file) return false;
      var rect = null;
      try { rect = found.range.getBoundingClientRect(); } catch (err) { rect = null; }
      if (!rect || (rect.width === 0 && rect.height === 0)) { hideSelectionAction(); return false; }
      var text = found.text.slice(0, MAX_QUOTE);
      var target = { quote: text, path: view.file, rel: view.rel, cwd: view.cwd, sessionId: view.sessionId, rect: rect,
        anchor: captureTextAnchor(found.range, text),
        betterSelection: !!(found.range.commonAncestorContainer.nodeType === 1 ? found.range.commonAncestorContainer : found.range.commonAncestorContainer.parentElement).closest('[data-annotation-preview]') };
      offerSelection(target);
      return true;
    }

    function offerSelection(target) {
      hideSelectionAction();
      selectionTarget = target;
      selectionAction = button('pop', t('actionNote'), function () {
        if (selectionTarget !== target || view.file !== target.path || view.sessionId !== target.sessionId) return;
        showInline(target.rect, target.quote, null, target);
      });
      selectionAction.appendChild(element('kbd', 'shortcut', selectionKeys()));
      selectionAction.addEventListener('pointerdown', function (event) { selectionToolbarPressed = true; event.preventDefault(); });
      selectionAction.addEventListener('mousedown', function (event) { event.preventDefault(); });
      document.body.appendChild(selectionAction);
      placeInlineSurface(selectionAction, target.rect, 132, 28);
      syncSelectionToolbar();
    }

    function openSelectionEditor() {
      if (selectionTarget && selectionTarget.htmlAnchor && activeHtmlEntry()) {
        var htmlTarget = selectionTarget;
        showInline(htmlTarget.rect,htmlTarget.quote,null,htmlTarget);
        return true;
      }
      if (!evaluateSelection() || !selectionTarget) return false;
      var target = selectionTarget;
      showInline(target.rect, target.quote, null, target);
      return true;
    }

    // ── Pointer capture keeps drags alive across iframe edges and pane bounds ──

    var selectionTimer = null;

    function scheduleSelection() {
      if (selectionTimer) clearTimeout(selectionTimer);
      selectionTimer = setTimeout(function () {
        selectionTimer = null;
        if (!pointerDown && !regionMode) evaluateSelection();
      }, 140);
    }

    function onDocPointerDown(event) {
      if (!event || event.button !== 0 || event.isPrimary === false) return;
      if (htmlToolMenu && !htmlToolMenu.contains(event.target) && event.target !== htmlMenuAnchor && !htmlMenuAnchor.contains(event.target)) hideHtmlMenu();
      activatePreview(event.target);
      if (ownsNode(event.target) && !(event.target && event.target.__annotationCarrier)) return;
      pointerDown = true;
      if (selectionTimer) { clearTimeout(selectionTimer); selectionTimer = null; }
      hideSelectionAction();
      if (!regionMode) return;
      var carrier = event.target && event.target.__annotationCarrier || carrierAt(event.clientX, event.clientY);
      if (carrier && carrier.kind === 'pdf') {
        var page = carrier.el.closest('[data-pdf-page]');
        var visible = visibleCarrierRect(carrier.el);
        // Leave the scrollbar, preview controls and touch scrolling to the host.
        if (event.pointerType === 'touch' || !visible || event.clientX < visible.left || event.clientX > visible.right || event.clientY < visible.top || event.clientY > visible.bottom
            || (page ? !page.contains(event.target) : event.target !== carrier.el)
            || (event.target.closest && event.target.closest('button,a,input,textarea,select,[role="button"],[role="slider"]'))) return;
      }
      var started = beginRegionDrag(event.clientX, event.clientY, carrier);
      if (started) {
        if (event.target && typeof event.target.setPointerCapture === 'function') {
          try {
            event.target.setPointerCapture(event.pointerId);
            capturePointer = { el: event.target, id: event.pointerId };
          } catch (err) { /* document listeners still handle ordinary drags */ }
        }
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
      }
    }

    function onDocPointerMove(event) {
      if (!dragStart || !event) return;
      positionRegionSelect(event.clientX, event.clientY);
      if (event.preventDefault) event.preventDefault();
    }

    function onDocPointerUp(event) {
      if (event && (event.button !== 0 || event.isPrimary === false)) return;
      pointerDown = false;
      if (dragStart) {
        finishRegionDrag(event ? event.clientX : 0, event ? event.clientY : 0);
        return;
      }
      if (regionMode) return;
      if (event && ownsNode(event.target)) return;
      scheduleSelection();
    }

    function onSelectionChange() {
      if (!pointerDown && !regionMode && !inlineEl) scheduleSelection();
    }

    function onPointerCancel(event) {
      // A capture listener on window also sees blur from focused descendants
      // (toolbar -> note input, arrow -> menu item). Only a window blur means
      // the application lost focus; ordinary focus transfers keep the tool.
      if (event && event.type === 'blur' && event.target && event.target !== window) return;
      hideHtmlMenu();
      pointerDown = false;
      // Focusing our opaque preview blurs the parent window too. It must not
      // cancel a box gesture that has just started inside that frame.
      var focusedFrame = htmlEntry(document.activeElement);
      if (event && event.type === 'blur' && focusedFrame && focusedFrame.ready && nodeVisible(focusedFrame.frame)
          && (typeof document.hasFocus !== 'function' || document.hasFocus())) return;
      if (regionMode) setRegionMode(false);
      hideSelectionAction();
    }

    // ======================================================================
    // 九、React 侧：插槽组件
    // ======================================================================

    /**
     * Subscribe to the store for one cwd; re-renders the button on changes.
     * Exactly three hooks, always, whatever the props say.
     */
    function useAnnotations(cwd) {
      var state = React.useState(0);
      var force = state[1];
      React.useEffect(function () {
        return subscribe(function () { force(function (n) { return n + 1; }); });
      }, [force]);
      React.useEffect(function () {
        if (cwd) loadStore(cwd);
      }, [cwd]);
      return itemsOf(cwd);
    }

    /**
     * Watch what the preview actually rendered (PDF canvases, an image, a frame).
     * The preview mounts asynchronously, so a single read at mount would miss it;
     * the probe stops as soon as it has an answer.
     */
    function regionKindOf(kind) {
      return kind === 'pdf' || kind === 'image' || kind === 'html';
    }

    function usePreviewKind() {
      var state = React.useState(null);
      var setKind = state[1];
      React.useEffect(function () {
        var settled = false;
        var stop = function (kind) {
          if (settled) return;
          settled = true;
          setKind(kind);
        };
        var first = previewKind();
        // 'text' right after mount usually means "the PDF/image has not painted yet",
        // so keep probing until a real carrier shows up or the budget runs out.
        if (regionKindOf(first)) { stop(first); return undefined; }
        var attempts = 0;
        var timer = setInterval(function () {
          attempts += 1;
          var kind = previewKind();
          if (regionKindOf(kind) || attempts > 16) {
            clearInterval(timer);
            stop(kind);
          }
        }, 400);
        return function () { clearInterval(timer); };
      }, [view.file]);
      return state[0];
    }

    function dirname(path) {
      if (!path) return null;
      var cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
      return cut > 0 ? path.slice(0, cut) : path;
    }

    /** Runs only inside the existing opaque, script-enabled HTML sandbox. */
    function htmlFrameRuntime(key, parentOrigin) {
      var mode = 'none', drag = null, notes = [], scheduled = false, overlay = null, shortcut = null, channel = null, suppressClick = false;
      var own = 'data-dsh-annotation-overlay';
      function emit(type, value) { if (channel) channel.postMessage(Object.assign({ channel: 'dsh-html-annotations', key: key, type: type,
        viewport: { width: innerWidth, height: innerHeight } }, value || {})); }
      function norm(text) { return String(text || '').replace(/[\s\u200b\u00ad\ufeff]/g, ''); }
      function rectOf(rect) { return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }; }
      function visible(el) {
        if (!el || el.closest('[' + own + ']')) return false;
        var style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
      }
      function selector(el) {
        if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
        var parts = [];
        for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
          if (node === document.body) { parts.unshift('body'); break; }
          var index = 1;
          for (var sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) if (sibling.tagName === node.tagName) index++;
          parts.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + index + ')');
          if (parts.length >= 32) break;
        }
        return parts.join(' > ');
      }
      function elementAnchor(el, kind) { return { version: 1, kind: kind, selector: selector(el),
        tag: el.tagName.toLowerCase(), text: (el.innerText || el.textContent || '').trim().slice(0, 256) }; }
      function scrollOffset(el, axis) { return el === document.scrollingElement ? 0 : (el[axis] || 0); }
      function textIndex(root) {
        var walker = document.createTreeWalker(root, 4), entries = [], text = '', node;
        while ((node = walker.nextNode())) {
          var el = node.parentElement;
          if (!visible(el) || el.closest('script,style,noscript,template,input,textarea,select')) continue;
          var raw = node.nodeValue || '', positions = [], part = '';
          for (var i = 0; i < raw.length; i++) if (!/[\s\u200b\u00ad\ufeff]/.test(raw[i])) { part += raw[i]; positions.push(i); }
          if (part) { entries.push({ node: node, start: text.length, end: text.length + part.length, positions: positions }); text += part; }
        }
        return { entries: entries, text: text };
      }
      function rangeFor(root, quote, anchor) {
        var index = textIndex(root), needle = norm(quote), best = null, score = -Infinity, at = 0;
        if (!needle) return null;
        while ((at = index.text.indexOf(needle, at)) >= 0) {
          var value = -Math.min(50, Math.abs(at - anchor.start) / 100);
          if (anchor.prefix && index.text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix) value += 100;
          if (anchor.suffix && index.text.slice(at + needle.length, at + needle.length + anchor.suffix.length) === anchor.suffix) value += 100;
          if (value > score) { best = at; score = value; } at++;
        }
        if (best == null) return null;
        var first = index.entries.find(function (e) { return e.start <= best && e.end > best; });
        var end = best + needle.length;
        var last = index.entries.find(function (e) { return e.start < end && e.end >= end; });
        if (!first || !last) return null;
        var range = document.createRange();
        range.setStart(first.node, first.positions[best - first.start]);
        range.setEnd(last.node, last.positions[end - last.start - 1] + 1);
        return range;
      }
      function clip(rect, el) {
        var left = Math.max(0, rect.left), top = Math.max(0, rect.top), right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
        for (var p = el; p; p = p.parentElement) {
          var style = getComputedStyle(p), r = p.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, r.left); right = Math.min(right, r.right); }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); }
        }
        return right > left && bottom > top ? { left: left, top: top, width: right - left, height: bottom - top } : null;
      }
      function geometry(note) {
        var anchor = note.htmlAnchor, el;
        try { el = document.querySelector(anchor.selector); } catch (error) { return []; }
        if (!visible(el)) return [];
        if (anchor.kind === 'text') {
          var range = rangeFor(el, note.quote, anchor);
          return range ? Array.from(range.getClientRects()).map(function (r) { return clip(r, el); }).filter(Boolean).slice(0, 64) : [];
        }
        // A changed positional selector must not silently jump to unrelated text.
        if (anchor.tag && el.tagName.toLowerCase() !== anchor.tag) return [];
        if (anchor.selector[0] !== '#' && anchor.text && !norm(el.innerText || el.textContent).includes(norm(anchor.text))) return [];
        var rect = el.getBoundingClientRect(), region = note.region;
        if (anchor.kind === 'region' && region) {
          var width = Math.max(el.scrollWidth, el.clientWidth, rect.width), height = Math.max(el.scrollHeight, el.clientHeight, rect.height);
          var left = rect.left + region.x * width - scrollOffset(el,'scrollLeft'), top = rect.top + region.y * height - scrollOffset(el,'scrollTop');
          rect = { left: left, top: top, right: left + region.w * width, bottom: top + region.h * height };
        }
        var clipped = clip(rect, el); return clipped ? [clipped] : [];
      }
      function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
          scheduled = false;
          emit('geometry', { items: notes.map(function (note) { return { id: note.id, rects: geometry(note) }; }) });
        });
      }
      function outline(rect) {
        if (!overlay) {
          overlay = document.createElement('div'); overlay.setAttribute(own, '');
          overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #4779f6;box-sizing:border-box;background:rgba(71,121,246,.12);';
          document.documentElement.appendChild(overlay);
        }
        overlay.style.left = rect.left + 'px'; overlay.style.top = rect.top + 'px';
        overlay.style.width = rect.width + 'px'; overlay.style.height = rect.height + 'px';
      }
      function clearOutline() { if (overlay) overlay.remove(); overlay = null; }
      function targetAt(x, y) {
        var el = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, x)), Math.max(0, Math.min(innerHeight - 1, y)));
        return el && !el.closest('[' + own + ']') ? (el.closest('button,a,input,select,textarea,[role="button"]') || el) : document.body;
      }
      function announceSelection(open) {
        if (mode !== 'none') return;
        var selected = getSelection();
        if (!selected || !selected.rangeCount || selected.isCollapsed) { emit('selection', { selection: null }); return; }
        var range = selected.getRangeAt(0), el = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
        if (!el || !visible(el) || el.closest('input,textarea,select,[contenteditable="true"]')) return;
        var root = el.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote,section,article') || el;
        var quote = selected.toString().trim().slice(0, 2000), index = textIndex(root), start = null;
        index.entries.some(function (e) { if (e.node !== range.startContainer) return false;
          start = e.start + norm(e.node.nodeValue.slice(0, range.startOffset)).length; return true; });
        if (!quote || start == null || index.text.slice(start, start + norm(quote).length) !== norm(quote)) return;
        var anchor = Object.assign(elementAnchor(root, 'text'), { start: start, end: start + norm(quote).length,
          prefix: index.text.slice(Math.max(0, start - 64), start), suffix: index.text.slice(start + norm(quote).length, start + norm(quote).length + 64) });
        emit('selection', { selection: { quote: quote, htmlAnchor: anchor, rect: rectOf(range.getBoundingClientRect()), open: open === true } });
      }
      function command(data) {
        if (!data || data.channel !== 'dsh-html-annotations' || data.key !== key) return;
        if (data.type === 'notes' && Array.isArray(data.notes)) { notes = data.notes.slice(0, 501); shortcut = data.shortcut; schedule(); }
        if (data.type === 'mode') {
          mode = ['box','element'].includes(data.mode) ? data.mode : 'none'; drag = null; clearOutline();
          document.documentElement.style.cursor = mode === 'none' ? '' : 'crosshair';
        }
      }
      // Capture the transferred capability before page-authored listeners.
      // Ordinary window.postMessage packets cannot invoke annotation actions.
      // All page-derived locations remain untrusted proposals: only the parent
      // editor can save a note, and only its native composer can send a batch.
      addEventListener('message', function (event) {
        var data = event.data;
        if (!event.isTrusted || event.source !== parent || event.origin !== parentOrigin || !data || data.channel !== 'dsh-html-annotations'
            || data.key !== key || data.type !== 'connect' || !event.ports || !event.ports[0]) return;
        event.stopImmediatePropagation();
        if (channel) channel.close(); channel = event.ports[0];
        channel.onmessage = function (message) { command(message.data); }; channel.start();
        emit('ready'); schedule();
      },true);
      addEventListener('pointerdown', function (event) {
        suppressClick = mode !== 'none';
        if (mode === 'none' || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); event.stopImmediatePropagation();
        drag = { x: event.clientX, y: event.clientY, element: targetAt(event.clientX, event.clientY) };
        try { document.documentElement.setPointerCapture(event.pointerId); } catch (error) { /* document capture remains */ }
      }, true);
      addEventListener('click',function (event) {if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
      addEventListener('pointermove', function (event) {
        if (mode === 'none') return;
        if (mode === 'element') {
          var hovered = targetAt(event.clientX, event.clientY), clipped = clip(hovered.getBoundingClientRect(), hovered);
          if (clipped) outline(clipped); else clearOutline();
        }
        else if (drag) outline({ left: Math.min(drag.x,event.clientX), top: Math.min(drag.y,event.clientY), width: Math.abs(drag.x-event.clientX), height: Math.abs(drag.y-event.clientY) });
      }, true);
      addEventListener('pointerout', function (event) { if (!event.relatedTarget && !drag) clearOutline(); }, true);
      addEventListener('pointerup', function (event) {
        if (mode === 'none') { setTimeout(function () { announceSelection(false); }, 30); return; }
        if (!drag || event.button !== 0) return;
        event.preventDefault(); event.stopImmediatePropagation();
        var from = drag; drag = null;
        var pickedMode = mode; mode = 'none'; document.documentElement.style.cursor = ''; clearOutline();
        try { document.documentElement.releasePointerCapture(event.pointerId); } catch (error) { /* already released */ }
        var rect, el = from.element, region = { kind: 'html', page: 1, x: 0, y: 0, w: 1, h: 1 };
        if (pickedMode === 'box') {
          var left = Math.min(from.x,event.clientX), top = Math.min(from.y,event.clientY), right = Math.max(from.x,event.clientX), bottom = Math.max(from.y,event.clientY);
          if (right-left < 5 || bottom-top < 5) { emit('cancel'); return; }
          var endEl = targetAt(event.clientX,event.clientY);
          while (el && !el.contains(endEl)) el = el.parentElement;
          el = el || document.body;
          while (el.parentElement) {
            var bounds = el.getBoundingClientRect();
            if (bounds.left <= left+2 && bounds.top <= top+2 && bounds.right >= right-2 && bounds.bottom >= bottom-2) break;
            el = el.parentElement;
          }
          var r = el.getBoundingClientRect(), w = Math.max(el.scrollWidth,el.clientWidth,r.width), h = Math.max(el.scrollHeight,el.clientHeight,r.height);
          region.x = Math.max(0,(left-r.left+scrollOffset(el,'scrollLeft'))/w); region.y = Math.max(0,(top-r.top+scrollOffset(el,'scrollTop'))/h);
          region.w = Math.min(1,(right-left)/w); region.h = Math.min(1,(bottom-top)/h);
          rect = { left:left,top:top,width:right-left,height:bottom-top };
        } else rect = rectOf(el.getBoundingClientRect());
        emit('pick', { selection: { quote: (el.innerText || el.textContent || '').trim().slice(0,2000),
          htmlAnchor: elementAnchor(el,pickedMode === 'box' ? 'region' : 'element'), region: region, rect: rect } });
      }, true);
      addEventListener('keydown', function (event) {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') { mode = 'none'; drag = null; clearOutline(); document.documentElement.style.cursor = ''; emit('cancel'); return; }
        if (shortcut && event.code === shortcut.code && ['meta','control','shift','alt'].every(function (m) {
          return !!event[m === 'control' ? 'ctrlKey' : m + 'Key'] === (shortcut.modifiers.includes(m) || (m === 'meta' && shortcut.modifiers.includes('primary')));
        })) { event.preventDefault(); announceSelection(true); }
      }, true);
      document.addEventListener('selectionchange', function () { if (mode === 'none') setTimeout(function () { announceSelection(false); }, 100); });
      addEventListener('pointercancel',function () { drag = null; clearOutline(); if(mode !== 'none') emit('cancel'); },true);
      addEventListener('scroll', function () { if (!drag) clearOutline(); schedule(); emit('selection',{selection:null}); }, true); addEventListener('resize', schedule);
      addEventListener('pagehide', function () { emit('retired'); });
      var observer = new MutationObserver(function (changes) { if (changes.some(function (c) { return !(c.target.nodeType === 1 && c.target.closest('[' + own + ']')); })) schedule(); });
      observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});
      if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(document.documentElement);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',function () { emit('ready'); schedule(); },{once:true});
      else { emit('ready'); schedule(); }
    }

    function htmlEntry(frame) { return frame ? htmlFrames.get(frame) : null; }
    function activeHtmlEntry() {
      var pane = paneElement(), frame = pane && pane.querySelector('iframe');
      var entry = htmlEntry(frame); return entry && entry.ready && nodeVisible(frame) ? entry : null;
    }
    function frameRect(entry, raw, viewport) {
      if (!raw || !viewport || ![raw.left,raw.top,raw.width,raw.height,viewport.width,viewport.height].every(function (n) { return Number.isFinite(n) && Math.abs(n) <= 10000000; })
          || raw.width <= 0 || raw.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return null;
      var rect = entry.frame.getBoundingClientRect(), clip = visibleCarrierRect(entry.frame);
      if (!clip) return null;
      var sx = rect.width / viewport.width, sy = rect.height / viewport.height;
      var left = Math.max(clip.left,rect.left+raw.left*sx), top = Math.max(clip.top,rect.top+raw.top*sy);
      var right = Math.min(clip.right,rect.left+(raw.left+raw.width)*sx), bottom = Math.min(clip.bottom,rect.top+(raw.top+raw.height)*sy);
      return right > left && bottom > top ? {left:left,top:top,right:right,bottom:bottom,width:right-left,height:bottom-top} : null;
    }
    function htmlRects(item) {
      var entry = activeHtmlEntry(), value = entry && entry.geometry.get(item.id);
      return value ? value.rects.map(function (rect) { return frameRect(entry,rect,value.viewport); }).filter(Boolean) : [];
    }
    function syncHtmlNotes() {
      htmlFrames.forEach(function (entry) {
        if (!entry.ready || !nodeVisible(entry.frame)) return;
        var context = entry.context(); if (!context) return;
        var notes = itemsOf(context.cwd).filter(function (item) { return item.path === context.path && item.sessionId === context.sessionId && item.htmlAnchor; });
        if (inlineTarget && inlineTarget.path === context.path && inlineTarget.sessionId === context.sessionId && inlineTarget.htmlAnchor) notes = notes.concat([Object.assign({ id:'__draft' },inlineTarget)]);
        var shortcut = shortcutService ? selectionShortcutBinding : {code:'KeyE',modifiers:isMac()?['meta','shift']:['control','shift']};
        if (shortcut) shortcut = {code:shortcut.code,modifiers:shortcut.modifiers.map(function (m) {return m === 'primary' ? (isMac() ? 'meta' : 'control') : m;})};
        entry.send({type:'notes',notes:notes.map(function (note) {return {id:note.id,quote:note.quote,htmlAnchor:note.htmlAnchor,region:note.region};}),shortcut:shortcut});
      });
    }
    function onHtmlMessage(event, transport) {
      var data = event && event.data, entry = null;
      if (!data || data.channel !== 'dsh-html-annotations' || typeof data.key !== 'string') return;
      htmlFrames.forEach(function (value) { if (event.source === value.frame.contentWindow && data.key === value.key) entry = value; });
      if (!entry || event.origin !== 'null' || !entry.port || transport !== entry.port) return;
      if (data.type === 'ready') { if(!entry.ready){entry.ready = true; bump();} return; }
      if (data.type === 'retired') { entry.ready = false; entry.geometry.clear(); entry.port.close();entry.port=null;syncMarkers(); return; }
      if (!entry.ready || !nodeVisible(entry.frame)) return;
      var context = entry.context(); if (!context) return;
      if (data.type === 'geometry') {
        if (!Array.isArray(data.items)) return;
        var allowed = new Set(itemsOf(context.cwd).filter(function (n) { return n.path === context.path && n.sessionId === context.sessionId && n.htmlAnchor; }).map(function (n) {return n.id;}));
        allowed.add('__draft'); entry.geometry.clear();
        data.items.slice(0,501).forEach(function (item) { if (item && allowed.has(item.id) && Array.isArray(item.rects)) entry.geometry.set(item.id,{rects:item.rects.slice(0,64),viewport:data.viewport}); });
        syncMarkers(); syncDraftRegion(); return;
      }
      if (data.type === 'cancel') { if (regionMode) setRegionMode(false); hideSelectionAction(); return; }
      if (data.type !== 'selection' && data.type !== 'pick') return;
      if (inlineEl || (regionMode && data.type === 'selection')) return;
      if (!data.selection) { if (selectionTarget && selectionTarget.htmlAnchor) hideSelectionAction(); return; }
      var selection = data.selection, anchor = normalizeHtmlAnchor(selection.htmlAnchor), rect = frameRect(entry,selection.rect,data.viewport);
      if (!anchor || !rect) return;
      activatePreview(entry.frame);
      var target = Object.assign({},context,{quote:typeof selection.quote === 'string'?selection.quote.slice(0,MAX_QUOTE):'',htmlAnchor:anchor,rect:rect});
      if (data.type === 'pick') {
        var region = normalizeRegionInput(selection.region); if (!region || anchor.kind === 'text') return;
        setRegionMode(false); showInline(rect,target.quote || t('htmlElement'),region,target);
      } else if (anchor.kind === 'text') {
        if (!target.quote) return;
        offerSelection(target);
        if (selection.open === true) showInline(rect,target.quote,null,target);
      }
    }
    function attachHtmlPreview(root, getContext) {
      if (!root || typeof window.MutationObserver !== 'function' || typeof window.DOMParser !== 'function') return function () {};
      var active = true, owned = new Set();
      function scan() {
        var frames = root.querySelectorAll('iframe');
        Array.prototype.forEach.call(frames,function (frame) {
          var previous = htmlFrames.get(frame);
          if (previous && previous.source === frame.getAttribute('src')) return;
          if (previous) { previous.cancelled = true; if(previous.port)previous.port.close(); frame.removeEventListener('load',previous.connect); htmlFrames.delete(frame); }
          var source = frame.getAttribute('src'), sandbox = frame.getAttribute('sandbox');
          if (!source || sandbox == null || !sandbox.split(/\s+/).includes('allow-scripts')) return;
          var url; try { url = new URL(source,window.location.href); } catch (error) { return; }
          if (url.origin !== window.location.origin || !url.pathname.startsWith('/sidebar/html/')) return;
          var entry = {frame:frame,source:source,originalSandbox:sandbox,key:makeId()+makeId(),ready:false,geometry:new Map(),context:getContext,
            send:function (data) { if (active && entry.port) entry.port.postMessage(Object.assign({channel:'dsh-html-annotations',key:entry.key},data)); }};
          entry.connect = function () {
            if (!active || entry.cancelled || entry.connected || !frame.getAttribute('srcdoc') || typeof window.MessageChannel !== 'function') return;
            entry.connected=true;
            if (entry.port) entry.port.close(); entry.ready=false; entry.geometry.clear();
            var pair = new window.MessageChannel(); entry.port = pair.port1;
            pair.port1.onmessage = function (message) { onHtmlMessage({source:frame.contentWindow,origin:'null',data:message.data},pair.port1); };
            pair.port1.start(); frame.contentWindow.postMessage({channel:'dsh-html-annotations',key:entry.key,type:'connect'},'*',[pair.port2]);
          };
          frame.addEventListener('load',entry.connect);
          htmlFrames.set(frame,entry); owned.add(frame);
          // Read the same already-authorized preview URL. The HTML remains in
          // its original opaque sandbox; no host API or parent DOM is exposed.
          window.fetch(url.href,{credentials:'same-origin'}).then(function (response) {
            if (!response.ok) throw new Error('preview unavailable');
            var policy = response.headers && response.headers.get('content-security-policy');
            return response.text().then(function (html) {return {html:html,policy:policy};});
          }).then(function (payload) {
            var html=payload.html;
            if (!active || entry.cancelled || !root.contains(frame) || html.length > 8*1024*1024) return;
            var doc = new window.DOMParser().parseFromString(html,'text/html');
            var base = doc.head.querySelector('base[href]');
            if (base) base.href = new URL(base.getAttribute('href'),url.href).href;
            else { base = doc.createElement('base'); base.href = url.href; doc.head.prepend(base); }
            var policy = doc.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy'; policy.content = payload.policy || "object-src 'none'";
            // CSP's sandbox directive is not enforced in a meta element. Retain
            // its intersection with the original iframe's tokens explicitly.
            var tokens=sandbox.split(/\s+/), match, sandboxPattern=/(?:^|;|,)\s*sandbox(?:\s+([^;,]*))?/gi;
            while((match=sandboxPattern.exec(payload.policy || ''))) {var allowed=(match[1]||'').trim().split(/\s+/);tokens=tokens.filter(function (token) {return allowed.includes(token);});}
            frame.setAttribute('sandbox',tokens.join(' '));
            var script = doc.createElement('script'); script.textContent = '('+htmlFrameRuntime.toString()+')('+JSON.stringify(entry.key)+','+JSON.stringify(window.location.origin)+');';
            doc.head.prepend(policy,script);
            frame.srcdoc = '<!doctype html>\n'+doc.documentElement.outerHTML;
          }).catch(function () { /* Keep the original renderer. */ });
        });
        owned.forEach(function (frame) { if (!root.contains(frame)) { var entry=htmlFrames.get(frame); if(entry) {entry.cancelled=true; if(entry.port)entry.port.close();frame.removeEventListener('load',entry.connect);} htmlFrames.delete(frame); owned.delete(frame); } });
      }
      var observer = new window.MutationObserver(scan); observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src']}); scan();
      return function () { active = false; observer.disconnect(); owned.forEach(function (frame) {
        var entry=htmlFrames.get(frame);if(entry){entry.cancelled=true;if(entry.port)entry.port.close();frame.removeEventListener('load',entry.connect);}htmlFrames.delete(frame);
        if (root.contains(frame)) {frame.removeAttribute('srcdoc');if(entry)frame.setAttribute('sandbox',entry.originalSandbox);}
      }); owned.clear(); };
    }

    /** Keep Better Sidebar's real editor and its save/mode controls mounted. */
    function BetterAnnotationViewer(props) {
      var original = props.original;
      var fileProps = props.fileProps;
      var rootRef = React.useRef(null);
      var scope = fileProps.scope || {};
      var file = fileProps.path || '';
      if (file && !/^(?:\/|[A-Za-z]:[\\/])/.test(file) && scope.cwd) file = scope.cwd.replace(/[/\\]+$/, '') + '/' + file;
      React.useEffect(function () { if (scope.cwd) rememberCwd(scope.sessionId, scope.cwd); }, [scope.cwd, scope.sessionId]);
      React.useEffect(function () {
        if (original.id !== 'html') return undefined;
        return attachHtmlPreview(rootRef.current,function () {
          var sessionId = mountedSession(scope.sessionId);
          var cwd = cachedCwd(sessionId) || (sessionId === scope.sessionId ? scope.cwd : null);
          return {path:file,rel:relativeFor(file,cwd),sessionId:sessionId,cwd:cwd};
        });
      },[file,scope.cwd,scope.sessionId,original.id]);
      var h = React.createElement;
      return h('div', { ref:rootRef, 'data-annotation-preview': 'better-sidebar', 'data-annotation-file': file },
        h('div', { 'data-dsh-file-annotations': 'viewerTools' },
          h(DocumentAnnotationsButton, { absolutePath: file, sessionId: scope.sessionId, requireHtmlBridge: original.id === 'html' })),
        // The original viewer can return sibling status/editor/iframe nodes.
        // Keep their column layout: a row stretches the status bar to full
        // height and pushes the width:100% iframe outside the visible pane.
        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 } },
          h(original.component, Object.assign({}, fileProps, { viewerId: original.id }))));
    }

    /** Optional public registry adapter; no mutation of another plugin's records. */
    function connectBetterSidebar(service) {
      if (!service || typeof service.getFileViewers !== 'function' || typeof service.registerFileViewer !== 'function') return function () {};
      var wrappers = new Map(), busy = false, stopped = false;
      function sync() {
        if (busy || stopped) return;
        busy = true;
        try {
          var originals = service.getFileViewers().filter(function (item) {
            return ['code', 'html', 'markdown', 'jsonl'].indexOf(item.id) >= 0
              && (typeof service.isViewerEnabled !== 'function' || service.isViewerEnabled(item.id));
          });
          wrappers.forEach(function (value, id) {
            if (originals.indexOf(value.original) < 0) { value.dispose(); wrappers.delete(id); }
          });
          originals.forEach(function (original) {
            if (wrappers.has(original.id)) return;
            var descriptor = Object.assign({}, original, { id: PKG + ':viewer:' + original.id,
              priority: (original.priority || 0) + 0.1, settings: undefined,
              component: function (fileProps) { return React.createElement(BetterAnnotationViewer, { original: original, fileProps: fileProps }); } });
            wrappers.set(original.id, { original: original, dispose: service.registerFileViewer(descriptor) });
          });
        } finally { busy = false; }
      }
      var off = typeof service.subscribe === 'function' ? service.subscribe(sync) : function () {};
      sync();
      return function () { stopped = true; off(); wrappers.forEach(function (value) { value.dispose(); }); wrappers.clear(); };
    }

    /**
     * Files tab header: open the batch panel for the tree's root.
     *
     * Hooks here are deliberately boring: the same three calls on every render and
     * never behind a prop check. An earlier version reached for the Session store
     * through a conditional hook and React tore the whole slot entry down with
     * "Rendered fewer hooks than expected" (#311) the moment a file preview opened,
     * which silently removed the button from the real app.
     */
    function FilesAnnotationsButton(props) {
      var anchor = React.useRef(null);
      var sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : null;
      // The files tree's owner prop is the tree root, i.e. the workspace itself.
      var cwd = props && typeof props.absolutePath === 'string' && props.absolutePath ? props.absolutePath : null;
      var items = useAnnotations(cwd);
      React.useEffect(function () {
        if (cwd) rememberCwd(sessionId, cwd);
        if (anchor.current && nodeVisible(anchor.current)) { activatePreview(anchor.current); syncMarkers(); }
      }, [cwd, sessionId]);
      var counts = countsFor(cwd, sessionId);
      var pending = counts.unsent;
      var label = counts.total === 0 ? t('actionNote') : t('actionNotes', { n: pending || counts.total });
      return React.createElement('button', {
        type: 'button',
        ref: anchor,
        'data-dsh-file-annotations': 'action',
        'data-annotation-root': cwd || '',
        'data-annotation-owner': sessionId || '',
        'data-has': pending > 0 ? '1' : '0',
        title: t('panelTitle'),
        onClick: function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (anchor.current) activatePreview(anchor.current);
          var targetSession = mountedSession(sessionId);
          var targetCwd = cachedCwd(targetSession) || (targetSession === sessionId ? cwd : null);
          if (!targetCwd) { flash(t('noWorkspace')); return; }
          togglePanel({ cwd: targetCwd, sessionId: targetSession });
        }
      }, label);
    }

    /**
     * A workspace root only counts when it really contains the file: guessing with
     * `dirname` would open a second store inside a subdirectory.
     */
    function cwdForFile(file) {
      if (!file) return null;
      var root = view.cwd && view.cwd.replace(/[/\\]+$/, '');
      if (root && (file === root || file.indexOf(root + '/') === 0 || file.indexOf(root + '\\') === 0)) return view.cwd;
      return null;
    }

    /** Document preview header: annotate the file that is on screen. */
    function DocumentAnnotationsButton(props) {
      var anchor = React.useRef(null);
      var sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : null;
      var file = props && typeof props.absolutePath === 'string' && props.absolutePath ? props.absolutePath : null;
      // No Session-store hook here on purpose: the workspace root comes from the
      // files tab entry (or a previous preview), and never from `dirname(file)`.
      var cwd = cachedCwd(mountedSession(sessionId)) || cwdForFile(file);
      var items = useAnnotations(cwd);
      React.useEffect(function () {
        if (anchor.current && nodeVisible(anchor.current)) { activatePreview(anchor.current); syncMarkers(); }
      }, [cwd, file, sessionId]);
      var counts = countsFor(cwd, mountedSession(sessionId));
      var count = counts.unsent || counts.total;
      var kind = usePreviewKind();
      var html = activeHtmlEntry();
      var canBox = !(props && props.textOnly) && (kind === 'pdf' || kind === 'image' || (kind === 'html' && (!(props && props.requireHtmlBridge) || html)));
      var boxButton = canBox ? React.createElement('button', {
        type: 'button',
        'data-dsh-file-annotations': 'action',
        'data-box': '1',
        'aria-pressed': regionMode && htmlPickMode === 'box',
        title: t('regionHint'),
        onClick: function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (anchor.current) activatePreview(anchor.current);
          setRegionMode(!(regionMode && htmlPickMode === 'box'));
        }
      }, regionMode && htmlPickMode === 'box' ? t('regionModeOn') : t('regionMode')) : null;
      var noteButton = React.createElement('button', {
        type: 'button',
        ref: anchor,
        'data-dsh-file-annotations': 'action',
        'data-annotation-file': file || '',
        'data-annotation-owner': sessionId || '',
        'data-has': count > 0 ? '1' : '0',
        title: t('panelTitle'),
        onClick: function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (anchor.current) activatePreview(anchor.current);
          var targetSession = mountedSession(sessionId);
          var targetCwd = cachedCwd(targetSession) || (targetSession === sessionId ? cwd : null);
          if (targetCwd) {
            togglePanel({ cwd: targetCwd, sessionId: targetSession, file: file, rel: relativeFor(file, targetCwd) });
            return;
          }
          var requestedSession = view.sessionId;
          var requestedFile = view.file;
          resolveCwd(targetSession).then(function (resolved) {
            if (view.sessionId !== requestedSession || view.file !== requestedFile) return;
            if (!resolved) { flash(t('noWorkspace')); return; }
            view.cwd = resolved;
            togglePanel({ cwd: resolved, sessionId: targetSession, file: file, rel: relativeFor(file, resolved) });
          });
        }
      }, count > 0 ? t('actionNotes', { n: count }) : t('actionNote'));
      return canBox
        ? React.createElement('span', { style: { display: 'inline-flex', gap: '2px' } }, noteButton,
          kind === 'html' && html ? React.createElement(HtmlSelectionTools, { activate: function () { if (anchor.current) activatePreview(anchor.current); } })
          : kind === 'pdf' ? React.createElement(PdfSelectionTools, { file: file, sessionId: sessionId, activate: function () { if (anchor.current) activatePreview(anchor.current); } }) : boxButton)
        : noteButton;
    }

    /** The native portal stays outside clipped preview toolbars. */
    function hideHtmlMenu(restoreFocus) {
      if (!htmlToolMenu) return;
      var anchor = htmlMenuAnchor;
      htmlToolMenu.remove(); htmlToolMenu = null; htmlMenuAnchor = null;
      if (anchor) anchor.setAttribute('aria-expanded', 'false');
      bump();
      if (restoreFocus && anchor && document.body.contains(anchor)) anchor.focus();
    }

    function toggleHtmlMenu(anchor, pdfSettings) {
      if (htmlMenuAnchor === anchor) { hideHtmlMenu(true); return; }
      hideHtmlMenu();
      htmlMenuAnchor = anchor;
      htmlToolMenu = element('div', 'toolMenu'); htmlToolMenu.setAttribute('role', 'menu');
      htmlToolMenu.setAttribute('aria-label', t(pdfSettings ? 'pdfSettings' : 'moreTools'));
      var active = pdfSettings ? pdfAutoBox() : regionMode && htmlPickMode === 'box';
      var item = button('toolMenuItem', pdfSettings ? t('pdfDefaultBox') : active ? t('regionModeOn') : t('boxRegion'), function () {
        var source = htmlMenuAnchor;
        hideHtmlMenu(); if (source) activatePreview(source);
        if (pdfSettings) setPdfAutoBox(!active); else setRegionMode(!active, 'box');
      });
      item.setAttribute('role', 'menuitemcheckbox'); item.setAttribute('aria-checked', String(active));
      htmlToolMenu.appendChild(item);
      htmlToolMenu.addEventListener('keydown', function (event) {
        if (event.isComposing || event.keyCode === 229) return;
        if (['ArrowDown','ArrowUp','Home','End'].indexOf(event.key) >= 0) { event.preventDefault(); item.focus(); }
        if (event.key === 'Tab') hideHtmlMenu(true);
      });
      document.body.appendChild(htmlToolMenu); anchor.setAttribute('aria-expanded', 'true');
      placeInlineSurface(htmlToolMenu, anchor.getBoundingClientRect(), htmlToolMenu.offsetWidth || 142, htmlToolMenu.offsetHeight || 40);
      bump(); item.focus();
    }

    function selectionIcon(chevron) {
      var h = React.createElement;
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        chevron ? h('path', { d: 'm7 10 5 5 5-5' }) : h('path', { d: 'M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4M9 8l3 10 2-4 4-2-9-4Z' }));
    }

    function PdfSelectionTools(props) {
      var menuRef = React.useRef(null);
      React.useEffect(function () {
        var anchor = menuRef.current;
        return function () { if (anchor && htmlMenuAnchor === anchor) hideHtmlMenu(); };
      }, []);
      React.useEffect(function () {
        if (menuRef.current && nodeVisible(menuRef.current)) { props.activate(); maybeApplyPdfDefault(); }
      }, [props.file, props.sessionId]);
      var h = React.createElement, active = regionMode && htmlPickMode === 'box';
      return h('span', { 'data-dsh-file-annotations': 'htmlTools' },
        h('button', { type: 'button', 'data-dsh-file-annotations': 'action', 'data-box': '1', 'data-tool-icon': 'pdfBox',
          title: t(active ? 'regionModeOn' : 'boxRegion'), 'aria-label': t(active ? 'regionModeOn' : 'boxRegion'), 'aria-pressed': active,
          onClick: function (event) { event.preventDefault(); event.stopPropagation(); props.activate(); setRegionMode(!active); }
        }, h('svg', {width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},
          h('rect', {x:4,y:4,width:16,height:16,rx:1,strokeDasharray:'3 3'}))),
        h('button', { type: 'button', ref: menuRef, 'data-dsh-file-annotations': 'action', 'data-tool-icon': 'pdfMore',
          title: t('pdfSettings'), 'aria-label': t('pdfSettings'), 'aria-haspopup': 'menu', 'aria-expanded': htmlMenuAnchor === menuRef.current && !!htmlToolMenu,
          onClick: function (event) { event.preventDefault(); event.stopPropagation(); props.activate(); toggleHtmlMenu(event.currentTarget, true); },
          onKeyDown: function (event) { if (event.key === 'ArrowDown' && !event.isComposing) { event.preventDefault(); props.activate(); if (!htmlToolMenu) toggleHtmlMenu(event.currentTarget, true); } }
        }, selectionIcon(true)));
    }

    function HtmlSelectionTools(props) {
      var menuRef = React.useRef(null);
      React.useEffect(function () {
        var anchor = menuRef.current;
        return function () { if (anchor && htmlMenuAnchor === anchor) hideHtmlMenu(); };
      }, []);
      var h = React.createElement;
      return h('span', { 'data-dsh-file-annotations': 'htmlTools' },
        h('button', { type: 'button', 'data-dsh-file-annotations': 'action', 'data-tool-icon': 'element',
          title: t('selectElement'), 'aria-label': t('selectElement'), 'aria-pressed': regionMode && htmlPickMode === 'element',
          onClick: function (event) { event.preventDefault(); event.stopPropagation(); props.activate(); setRegionMode(!(regionMode && htmlPickMode === 'element'), 'element'); }
        }, selectionIcon(false)),
        h('button', { type: 'button', ref: menuRef, 'data-dsh-file-annotations': 'action', 'data-tool-icon': 'more',
          title: t('moreTools'), 'aria-label': t('moreTools'), 'aria-haspopup': 'menu', 'aria-expanded': htmlMenuAnchor === menuRef.current && !!htmlToolMenu,
          'data-active': regionMode && htmlPickMode === 'box' ? '1' : '0',
          onClick: function (event) { event.preventDefault(); event.stopPropagation(); props.activate(); toggleHtmlMenu(event.currentTarget); },
          onKeyDown: function (event) { if (event.key === 'ArrowDown' && !event.isComposing) { event.preventDefault(); props.activate(); if (!htmlToolMenu) toggleHtmlMenu(event.currentTarget); } }
        }, selectionIcon(true)));
    }

    function locateNote(cwd, item) {
      var nav = composerRuntime && composerRuntime.sidebarRight;
      if (!nav || typeof nav.openResourceIn !== 'function') return false;
      var path = item.path.replace(/\\/g, '/');
      var root = cwd.replace(/\\/g, '/').replace(/\/+$/, '');
      if (path.indexOf(root + '/') === 0) path = path.slice(root.length + 1);
      var encode = function (part) { return encodeURIComponent(part).replace(/%3A/gi, ':'); };
      var address = 'dsh-resource://file/session/' + encode(item.sessionId) + '/' + path.split('/').map(encode).join('/');
      nav.openResourceIn(item.sessionId, address);
      return true;
    }

    function PendingNoteCard(props) {
      var item = props.item;
      var cwd = props.cwd;
      var edit = React.useState(false);
      var draft = React.useState(item.comment || '');
      var thumb = React.useState(cropPreviews.get(item.id) || null);
      React.useEffect(function () {
        if (!edit[0]) draft[1](item.comment || '');
      }, [item.comment, edit[0]]);
      React.useEffect(function () { return function () { editingNotes.delete(item.id); }; }, [item.id]);
      React.useEffect(function () {
        var active = true;
        if (cropPreviews.has(item.id)) { thumb[1](cropPreviews.get(item.id)); return undefined; }
        if (!item.crop) return undefined;
        post('api/dsh-file-annotations/crop-preview', { cwd: cwd, id: item.id }).then(function (value) {
          if (active && itemsOf(cwd).some(function (note) { return note.id === item.id; }) && value && typeof value.dataUrl === 'string' && /^data:image\/png;base64,/.test(value.dataUrl)) {
            cropPreviews.set(item.id, value.dataUrl);
            if (active) thumb[1](value.dataUrl);
          }
        }).catch(function () { /* coordinates and comment remain useful without a thumbnail */ });
        return function () { active = false; };
      }, [cwd, item.id, item.crop]);
      var h = React.createElement;
      var locked = noteInFlight(item);
      var save = function (send) {
        if (!updateAnnotation(cwd, item.id, draft[0])) return false;
        editingNotes.delete(item.id); edit[1](false);
        if (send === true) submitPending(item.sessionId, cwd);
        return true;
      };
      var cancel = function () { editingNotes.delete(item.id); edit[1](false); };
      var label = item.rel || item.path;
      if (item.region) label += ' · ' + (item.region.kind === 'pdf' ? t('regionPage', { n: item.region.page })
        : item.region.kind === 'image' ? t('regionTagImage') : item.htmlAnchor ? t(item.htmlAnchor.kind === 'element' ? 'htmlElement' : 'htmlRegion') : t('regionFrame'));
      return h('div', { 'data-dsh-file-annotations': 'pendingItem' },
        h('div', { 'data-dsh-file-annotations': 'pendingFile' },
          h('button', { type: 'button', 'data-dsh-file-annotations': 'pendingPath', title: t('locate'), onClick: function () { locateNote(cwd, item); } }, label),
          h('button', { type: 'button', 'data-dsh-file-annotations': 'pendingButton', disabled: locked,
            onClick: function () {
              draft[1](item.comment || '');
              if (edit[0]) editingNotes.delete(item.id); else editingNotes.add(item.id);
              edit[1](!edit[0]);
            } }, t('edit')),
          h('button', { type: 'button', 'data-dsh-file-annotations': 'pendingButton', disabled: locked, 'aria-label': t('removePending'),
            onClick: function () { removeAnnotation(cwd, item.id); } }, '×')),
        h('div', { 'data-dsh-file-annotations': 'pendingBody' },
          thumb[0] ? h('img', { 'data-dsh-file-annotations': 'pendingThumb', src: thumb[0], alt: t('noteReference') }) : null,
          h('div', { 'data-dsh-file-annotations': 'pendingText' },
            item.quote ? h('div', { 'data-dsh-file-annotations': 'pendingQuote' }, item.quote) : null,
            edit[0] ? h('div', null,
              h('textarea', { 'data-dsh-file-annotations': 'pendingEdit', value: draft[0], 'aria-label': t('edit'), disabled: locked,
                onChange: function (event) { draft[1](event.target.value); },
                onKeyDown: function (event) {
                  if (event.isComposing || event.keyCode === 229) return;
                  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key === 'Enter') {
                    event.preventDefault(); event.stopPropagation(); if (!event.repeat) save(true);
                  }
                  if (event.key === 'Escape') cancel();
                } }),
              h('button', { type: 'button', 'data-dsh-file-annotations': 'pendingButton', disabled: locked, onClick: function () { save(false); } }, t('inlineSave')),
              h('button', { type: 'button', 'data-dsh-file-annotations': 'pendingButton', onClick: cancel }, t('inlineCancel')))
              : h('span', null, item.comment))));
    }

    /** Full-width resident entry above the native composer, even with the sidebar closed. */
    function PendingAnnotations(props) {
      var session = props && props.session;
      var sessionId = session ? session.sessionId : props && props.sessionId;
      var cwd = session && typeof session.cwd === 'string' ? session.cwd : cachedCwd(sessionId);
      var actions = props && props.inputActions;
      var collapsed = React.useState(false);
      useAnnotations(cwd);
      React.useEffect(function () {
        var active = true;
        if (sessionId && !cwd) resolveCwd(sessionId).then(function (value) { if (active && value) bump(); });
        return function () { active = false; };
      }, [sessionId, cwd]);
      React.useEffect(function () {
        if (sessionId && cwd && composerRuntime) bindComposerSession(sessionId, cwd, actions);
      }, [sessionId, cwd, actions, composerRuntime]);
      var notes = pendingFor(cwd, sessionId);
      if (notes.length === 0) return null;
      var h = React.createElement;
      var flight = composerFlights.get(sessionId);
      var error = composerErrors.get(sessionId);
      return h('section', { 'data-dsh-file-annotations': 'pending', 'aria-label': t('pendingTitle', { n: notes.length }),
        onKeyDown: function (event) {
          if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey) return;
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault(); event.stopPropagation(); if (!event.repeat) submitPending(sessionId, cwd);
          }
        } },
        h('div', { 'data-dsh-file-annotations': 'pendingHead' },
          h('button', { type: 'button', 'data-dsh-file-annotations': 'pendingToggle', 'aria-expanded': !collapsed[0],
            onClick: function () { collapsed[1](!collapsed[0]); } }, (collapsed[0] ? '▸ ' : '▾ ') + t('pendingTitle', { n: notes.length })),
          h('span', { 'data-dsh-file-annotations': 'pendingHint', 'aria-live': 'polite' }, flight ? t('pendingSending') : t('pendingHint')),
          h('button', { type: 'button', 'data-dsh-file-annotations': 'submitNotes', disabled: !!flight,
            title: t('submitNotes') + ' · ' + submitKeys(), onClick: function () { submitPending(sessionId, cwd); }
          }, t('submitNotes') + ' ' + submitKeys())),
        h('div', { 'data-dsh-file-annotations': 'pendingList', style: collapsed[0] ? { display: 'none' } : undefined }, notes.map(function (item) {
          return h(PendingNoteCard, { key: item.id, item: item, cwd: cwd });
        })),
        error ? h('div', { 'data-dsh-file-annotations': 'pendingError', role: 'alert' }, error) : null);
    }

    /** conversation.input.overlay 的常驻条目：只为拿本会话的 inputActions。 */
    function ComposerBridge(props) {
      var ref = React.useRef(null);
      var actions = props ? props.inputActions : null;
      var sessionId = props ? props.sessionId : null;
      React.useEffect(function () {
        return registerBridge(ref.current, { inputActions: actions, sessionId: sessionId });
      }, [actions, sessionId]);
      return React.createElement('span', {
        ref: ref,
        'data-dsh-file-annotations': 'bridge',
        'aria-hidden': 'true',
        style: { display: 'none' }
      });
    }

    // ======================================================================
    // 十、生命周期
    // ======================================================================

    function onViewportChange() {
      hideHtmlMenu();
      if (panelOpen) placePanel();
      hideSelectionAction();
      if (dragStart) { if (dragStart.carrier.kind === 'pdf') setRegionMode(true); else setRegionMode(false); }
      else syncCaptureLayers();
      syncMarkers();
      syncDraftRegion();
    }

    function onKeydown(event) {
      if (!event || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      // Some preview renderers consume keydown before the Web adapter's bubble
      // listener. Respect the registry's effective user binding in capture too;
      // Desktop IPC continues to invoke the same registered command resolver.
      if (matchesSelectionShortcut(event) && openSelectionEditor()) {
        event.preventDefault(); event.stopPropagation(); return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        if (!event.shiftKey && event.key === 'Enter') {
          if (inlineEl && (!event.target || inlineEl.contains(event.target))) {
            event.preventDefault(); event.stopPropagation();
            if (!event.repeat) saveInline(function (record, cwd) { submitPending(record.sessionId, cwd); });
            return;
          }
          if (panelOpen && panelParts && event.target === panelParts.textarea) {
            event.preventDefault(); event.stopPropagation();
            if (!event.repeat) { if (panelParts.textarea.value.trim()) commitCompose(); submitPending(view.sessionId, view.cwd); }
            return;
          }
          // Preview focus can send saved notes; ordinary editable controls keep
          // ownership, including the native composer's own accelerated shortcut.
          var currentSession = mountedSession(view.sessionId);
          var currentCwd = cachedCwd(currentSession) || (currentSession === view.sessionId ? view.cwd : null);
          var previewCode = event.target && event.target.closest && event.target.closest('[data-code-preview], [data-annotation-preview] .cm-content') && !event.target.closest('input, textarea, select');
          if (!ownsNode(event.target) && (!editableNode(event.target) || previewCode) && pendingFor(currentCwd, currentSession).length) {
            event.preventDefault(); event.stopPropagation();
            if (!event.repeat) submitPending(currentSession, currentCwd);
            return;
          }
        }
      }
      if (event.key !== 'Escape') return;
      if (htmlToolMenu) { hideHtmlMenu(true); return; }
      if (selectionTimer) { clearTimeout(selectionTimer); selectionTimer = null; }
      if (inlineEl) { if (regionMode) setRegionMode(false); hideInline(); return; }
      if (selectionAction) { hideSelectionAction(); return; }
      if (regionMode) { setRegionMode(false); return; }
      if (panelOpen) closePanel();
    }

    function install() {
      if (installed) return;
      installed = true;
      installStyle();
      document.addEventListener('pointerdown', onDocPointerDown, true);
      document.addEventListener('pointermove', onDocPointerMove, true);
      document.addEventListener('pointerup', onDocPointerUp, true);
      document.addEventListener('pointercancel', onPointerCancel, true);
      document.addEventListener('selectionchange', onSelectionChange, true);
      document.addEventListener('keydown', onKeydown, true);
      window.addEventListener('resize', onViewportChange, true);
      window.addEventListener('scroll', onViewportChange, true);
      window.addEventListener('blur', onPointerCancel, true);
      if (typeof window.MutationObserver === 'function') {
        previewObserver = new window.MutationObserver(function (changes) {
          syncPreviewLifetimes();
          syncSelectionToolbar();
          var panes = Array.prototype.slice.call(document.querySelectorAll(SIDEBAR_PANE_SELECTOR));
          var relevant = changes.some(function (change) {
            if (ownsNode(change.target)) return false;
            if (change.type === 'childList') {
              var nodes = Array.prototype.slice.call(change.addedNodes || []).concat(Array.prototype.slice.call(change.removedNodes || []));
              if (nodes.length > 0 && nodes.every(ownsNode)) return false;
            }
            return panes.length ? panes.some(function (pane) { return change.target === pane || change.target.contains(pane) || pane.contains(change.target); }) : markerList.length > 0;
          });
          if (!relevant) return;
          var activePane = paneElement();
          if (!activePane) { pdfDefaultVisit = null; hideSelectionAction(); hideInline(); if (regionMode) setRegionMode(false); }
          else activatePreview(activePane);
          syncMarkers();
          syncDraftRegion();
        });
        previewObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
      }
      syncPreviewLifetimes();
      exposeApi();
    }

    function dispose() {
      if (!installed) return;
      installed = false;
      clearCloseUndo(); previewLifetimes.clear(); previewPanels.clear(); deferredCloses = []; closingTargets.clear();
      closeRetryTimers.forEach(function (timer) { clearTimeout(timer); }); closeRetryTimers.clear();
      hideHtmlMenu();
      if (previewObserver) { previewObserver.disconnect(); previewObserver = null; }
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('pointermove', onDocPointerMove, true);
      document.removeEventListener('pointerup', onDocPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('selectionchange', onSelectionChange, true);
      if (selectionTimer) { clearTimeout(selectionTimer); selectionTimer = null; }
      document.removeEventListener('keydown', onKeydown, true);
      window.removeEventListener('resize', onViewportChange, true);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('blur', onPointerCancel, true);
      htmlFrames.forEach(function (entry) { entry.cancelled=true; if(entry.port)entry.port.close();entry.frame.removeEventListener('load',entry.connect);entry.frame.removeAttribute('srcdoc');entry.frame.setAttribute('sandbox',entry.originalSandbox); });
      htmlFrames.clear();
      regionMode = false;
      pointerDown = false;
      removeCapture();
      hideSelectionAction();
      runtimeDisposers.splice(0).forEach(function (disposeRuntime) { disposeRuntime(); });
      composerEntries.forEach(function (entry) { entry.dispose(); });
      composerEntries.clear(); composerFlights.clear(); composerErrors.clear(); cropPreviews.clear(); editingNotes.clear();
      Object.keys(saveTimers).forEach(function (key) {
        if (saveTimers[key]) clearTimeout(saveTimers[key]);
        saveTimers[key] = null;
      });
      hideInline();
      clearMarkers();
      if (markerLayer && markerLayer.parentNode) markerLayer.parentNode.removeChild(markerLayer);
      markerLayer = null;
      if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
      panelEl = null;
      panelParts = null;
      panelOpen = false;
      removeFlash();
      removeStyle();
      bridges = [];
      listeners.clear();
      if (window[GLOBAL_KEY]) delete window[GLOBAL_KEY];
    }

    /** Debug/automation handle; the CDP smoke check drives this. */
    function exposeApi() {
      function state() {
        var cwd = view.cwd;
        var list = itemsOf(cwd);
        return {
          version: VERSION,
          cwd: cwd,
          file: view.file,
          sessionId: view.sessionId,
          panelOpen: panelOpen,
          annotations: list.length,
          unsent: list.filter(function (item) { return !item.sentAt; }).length,
          bridges: bridges.length,
          bridgeReady: !!pickBridge(),
          storeState: cwd ? loadState[cwd] || 'idle' : 'none'
        };
      }
      window[GLOBAL_KEY] = {
        __installed: true,
        version: VERSION,
        state: state,
        open: function (options) { return openPanel(options || {}); },
        close: closePanel,
        add: function (input) { return view.cwd ? addAnnotation(view.cwd, input) : null; },
        /** What the current view shows (Session-scoped unless the toggle is on “all”). */
        list: function () { return serializeList(visibleOf(view.cwd)); },
        /** Everything stored for this workspace, every Session included. */
        listAll: function () { return serializeList(itemsOf(view.cwd)); },
        buildPrompt: function (list) { return buildPrompt(list || itemsOf(view.cwd)); },
        insert: function (text) { return insertIntoComposer(text); },
        send: sendAll,
        clearSent: function () {
          var cwd = view.cwd;
          if (!cwd) return 0;
          var list = itemsOf(cwd);
          var kept = list.filter(function (item) { return !item.sentAt; });
          var removed = list.length - kept.length;
          byCwd[cwd] = kept;
          scheduleSave(cwd);
          bump();
          rerender();
          return removed;
        },
        setView: function (next) {
          if (next && typeof next.sessionId === 'string') setViewSession(next.sessionId);
          if (next && typeof next.cwd === 'string') view.cwd = next.cwd;
          if (next && typeof next.file === 'string') setViewFile(next.file, next.rel);
          return state();
        },
        flush: function () { return view.cwd ? saveStore(view.cwd) : Promise.resolve(false); }
      };
    }

    /**
     * Mount the browser half.
     * @param ctx Client root context (`inject: ['slots']` guarantees ctx.slots).
     */
    function apply(ctx) {
      install();
      ctx.effect(function () { return dispose; }, 'file-annotations: styles, panel, selection layer, composer bridge');

      if (typeof ctx.inject === 'function') ctx.inject(['conversation', 'sessions', 'inputTriggers'], function (scope) {
        scope.effect(function () {
          var disposeRuntime = connectComposerRuntime({ conversation: scope.conversation, sessions: scope.sessions,
            inputTriggers: scope.inputTriggers, sidebarRight: typeof scope.get === 'function' ? scope.get('sidebarRight') : null });
          return disposeRuntime;
        }, 'file-annotations: native composer integration');
      });
      if (typeof ctx.inject === 'function') ctx.inject(['shortcuts'], function (scope) {
        scope.effect(function () { return connectShortcuts(scope.shortcuts); }, 'file-annotations: selection shortcut');
      });
      if (typeof ctx.inject === 'function') ctx.inject(['betterSidebar'], function (scope) {
        scope.effect(function () { return connectBetterSidebar(scope.betterSidebar); }, 'file-annotations: Better Sidebar editors');
      });
      ctx.slots.inject(SLOT_PENDING, function () {
        return ctx.slots.register({ name: SLOT_PENDING, id: PKG + ':pending', order: 40 }, PendingAnnotations);
      });
      ctx.slots.inject(SLOT_BRIDGE, function () {
        return ctx.slots.register({ name: SLOT_BRIDGE, id: PKG + ':bridge', order: 60 }, ComposerBridge);
      });
      ctx.slots.inject(SLOT_FILES_ACTIONS, function () {
        return ctx.slots.register({ name: SLOT_FILES_ACTIONS, id: PKG + ':files', order: 60 }, FilesAnnotationsButton);
      });
      ctx.slots.inject(SLOT_DOC_ACTIONS, function () {
        return ctx.slots.register({ name: SLOT_DOC_ACTIONS, id: PKG + ':document', order: 60 }, DocumentAnnotationsButton);
      });
    }

    exports.apply = apply;
    exports.inject = ['slots'];

    // Test/automation view of the internals (never used at runtime).
    exports.__internals = {
      PKG: PKG,
      VERSION: VERSION,
      STYLE_TAG_ID: STYLE_TAG_ID,
      GLOBAL_KEY: GLOBAL_KEY,
      MARK: MARK,
      LS_PREFIX: LS_PREFIX,
      READ_ROUTE: READ_ROUTE,
      WRITE_ROUTE: WRITE_ROUTE,
      SLOT_BRIDGE: SLOT_BRIDGE,
      SLOT_PENDING: SLOT_PENDING,
      pendingFor: pendingFor,
      detachPending: detachPending,
      connectBetterSidebar: connectBetterSidebar,
      BetterAnnotationViewer: BetterAnnotationViewer,
      syncSelectionToolbar: syncSelectionToolbar,
      HtmlSelectionTools: HtmlSelectionTools,
      toggleHtmlMenu: toggleHtmlMenu,
      PdfSelectionTools: PdfSelectionTools,
      pdfAutoBox: pdfAutoBox,
      setPdfAutoBox: setPdfAutoBox,
      maybeApplyPdfDefault: maybeApplyPdfDefault,
      clearPreviewNotes: clearPreviewNotes,
      loadStore: loadStore,
      saveStore: saveStore,
      undoClosedNotes: undoClosedNotes,
      trackPreviewLifetime: trackPreviewLifetime,
      syncPreviewLifetimes: syncPreviewLifetimes,
      cropPreviews: cropPreviews,
      syncCaptureLayers: syncCaptureLayers,
      htmlFrameRuntime: htmlFrameRuntime,
      htmlEntry: htmlEntry,
      normalizeHtmlAnchor: normalizeHtmlAnchor,
      onHtmlMessage: onHtmlMessage,
      frameRect: frameRect,
      attachHtmlPreview: attachHtmlPreview,
      adoptAnnotation: adoptAnnotation,
      activatePreview: activatePreview,
      paneElement: paneElement,
      textIndex: textIndex,
      captureTextAnchor: captureTextAnchor,
      textMatch: textMatch,
      rangeFromMatch: rangeFromMatch,
      quoteRects: quoteRects,
      installShortcutPreset: installShortcutPreset,
      submitPending: submitPending,
      connectShortcuts: connectShortcuts,
      syncDraftRegion: syncDraftRegion,
      updateAnnotation: updateAnnotation,
      noteFingerprint: noteFingerprint,
      connectComposerRuntime: connectComposerRuntime,
      bindComposerSession: bindComposerSession,
      createAnnotationSource: createAnnotationSource,
      syncComposerReference: syncComposerReference,
      getComposerFlight: function (id) { return composerFlights.get(id); },
      getComposerError: function (id) { return composerErrors.get(id); },
      detectOffset: detectOffset,
      PendingAnnotations: PendingAnnotations,
      PendingNoteCard: PendingNoteCard,
      setEditingNote: function (id, value) { if (value) editingNotes.add(id); else editingNotes.delete(id); },
      SLOT_FILES_ACTIONS: SLOT_FILES_ACTIONS,
      SLOT_DOC_ACTIONS: SLOT_DOC_ACTIONS,
      CSS: CSS,
      STRINGS: STRINGS,
      t: t,
      buildPrompt: buildPrompt,
      makeRecord: makeRecord,
      serializeList: serializeList,
      parseList: parseList,
      relPathOf: relPathOf,
      dirname: dirname,
      cwdForFile: cwdForFile,
      normalizeDrag: normalizeDrag,
      beginRegionDrag: beginRegionDrag,
      finishRegionDrag: finishRegionDrag,
      carrierAt: carrierAt,
      carriers: carriers,
      carrierForRegion: carrierForRegion,
      cropDataUrl: cropDataUrl,
      previewKind: previewKind,
      setRegionMode: setRegionMode,
      getRegionMode: function () { return regionMode; },
      resolveCwd: resolveCwd,
      rememberCwd: rememberCwd,
      cachedCwd: cachedCwd,
      RESOLVE_ROUTE: RESOLVE_ROUTE,
      getLoadState: function (cwd) { return loadState[cwd] || 'idle'; },
      countsFor: countsFor,
      getScope: function () { return scope; },
      setScope: function (next) { scope = next === 'all' ? 'all' : 'session'; bump(); rerender(); syncMarkers(); return scope; },
      visibleOf: visibleOf,
      inScope: inScope,
      insertIntoComposer: insertIntoComposer,
      pickBridge: pickBridge,
      registerBridge: registerBridge,
      addAnnotation: addAnnotation,
      removeAnnotation: removeAnnotation,
      itemsOf: itemsOf,
      setItems: setItems,
      unsentOf: unsentOf,
      openPanel: openPanel,
      closePanel: closePanel,
      isPanelOpen: isPanelOpen,
      install: install,
      dispose: dispose,
      evaluateSelection: evaluateSelection,
      getView: function () { return view; },
      setViewRaw: function (next) { view = next; },
      getBridges: function () { return bridges; }
    };

    return module.exports;
  }
});
