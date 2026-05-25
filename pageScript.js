(function() {
    'use strict';

    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'paste' || type === 'copy' || type === 'cut') {
            if (this.id === 'code-input' || (this.closest && this.closest('#panel-container'))) {
                return originalAddEventListener.call(this, type, listener, options);
            }
            return;
        }
        return originalAddEventListener.call(this, type, listener, options);
    };

    Object.defineProperty(HTMLElement.prototype, 'onpaste', {
        set: function() {},
        get: function() { return null; }
    });

    Object.defineProperty(HTMLElement.prototype, 'oncopy', {
        set: function() {},
        get: function() { return null; }
    });

    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        if (node.classList && node.classList.contains('noCopyPaste')) {
                            node.classList.remove('noCopyPaste');
                        }
                        if (node.querySelectorAll) {
                            node.querySelectorAll('.noCopyPaste').forEach(function(el) {
                                el.classList.remove('noCopyPaste');
                            });
                        }
                    }
                });
            }
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (mutation.target.classList && mutation.target.classList.contains('noCopyPaste')) {
                    mutation.target.classList.remove('noCopyPaste');
                }
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['class']
    });

    // 监听来自内容脚本的消息，在页面上下文中操作 Monaco
    window.addEventListener('message', function(e) {
        if (!e.data || e.data.source !== 'paste-helper') return;

        if (e.data.action === 'readCode') {
            let code = '';
            try {
                if (window.monaco && monaco.editor) {
                    const editors = monaco.editor.getEditors();
                    if (editors && editors.length > 0) {
                        code = editors[0].getModel().getValue();
                    }
                }
            } catch(err) {}
            window.postMessage({ source: 'paste-helper-response', action: 'readCode', code: code }, '*');
        }

        if (e.data.action === 'injectCode') {
            let success = false;
            try {
                if (window.monaco && monaco.editor) {
                    const editors = monaco.editor.getEditors();
                    if (editors && editors.length > 0) {
                        editors[0].getModel().setValue(e.data.code);
                        success = true;
                    }
                }
            } catch(err) {}
            window.postMessage({ source: 'paste-helper-response', action: 'injectCode', success: success }, '*');
        }
    });
})();
