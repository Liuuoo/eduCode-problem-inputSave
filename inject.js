'use strict';

// 注入 pageScript.js 到页面上下文（在网站脚本之前运行）
const script = document.createElement('script');
script.src = chrome.runtime.getURL('pageScript.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

// 内容脚本层拦截事件（排除自己的面板）
function isOurPanel(el) {
    return el && (el.id === 'code-input' || el.closest && el.closest('#panel-container'));
}
document.addEventListener('paste', function(e) {
    if (!isOurPanel(e.target)) e.stopImmediatePropagation();
}, true);
document.addEventListener('copy', function(e) {
    if (!isOurPanel(e.target)) e.stopImmediatePropagation();
}, true);
document.addEventListener('cut', function(e) {
    if (!isOurPanel(e.target)) e.stopImmediatePropagation();
}, true);

// 持续移除 noCopyPaste 类
function removeNoCopyPaste() {
    document.querySelectorAll('.noCopyPaste').forEach(el => el.classList.remove('noCopyPaste'));
}

// 等待 DOM 加载完成后创建面板
function init() {
    removeNoCopyPaste();
    setInterval(removeNoCopyPaste, 1000);
    createPanel();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function createPanel() {
    // 避免 iframe 中重复创建
    if (window !== window.top) return;
    if (document.getElementById('panel-container')) return;

    const container = document.createElement('div');
    container.id = 'panel-container';
    container.innerHTML = `
        <div id="panel-header">
            <span class="min-icon">📋</span>
            <span class="header-title">📋 粘贴助手</span>
            <div class="header-btns">
                <button id="btn-minimize" title="最小化">—</button>
                <button id="btn-close" title="关闭">✕</button>
            </div>
        </div>
        <div id="panel-body">
            <textarea id="code-input" placeholder="在此粘贴你的代码..."></textarea>
            <div class="btn-row">
                <button class="btn-inject" id="btn-inject">注入代码</button>
                <button class="btn-read" id="btn-read">读取代码</button>
                <button class="btn-clear" id="btn-clear">清空</button>
            </div>
            <div class="btn-row">
                <button class="btn-download" id="btn-download">下载题面</button>
            </div>
            <div class="status" id="panel-status"></div>
        </div>
    `;
    document.body.appendChild(container);

    // 拖动功能
    makeDraggable(container);

    // 最小化
    document.getElementById('btn-minimize').addEventListener('click', function(e) {
        e.stopPropagation();
        container.classList.add('minimized');
    });

    // 点击最小化图标恢复
    container.addEventListener('click', function() {
        if (container.classList.contains('minimized')) {
            container.classList.remove('minimized');
        }
    });

    // 关闭
    document.getElementById('btn-close').addEventListener('click', function() {
        container.style.display = 'none';
    });

    // 注入代码到编辑器
    document.getElementById('btn-inject').addEventListener('click', function() {
        const code = document.getElementById('code-input').value;
        if (!code.trim()) {
            showStatus('请先输入代码', 'warn');
            return;
        }
        injectCode(code);
    });

    // 读取编辑器代码
    document.getElementById('btn-read').addEventListener('click', function() {
        readCode();
    });

    // 清空
    document.getElementById('btn-clear').addEventListener('click', function() {
        document.getElementById('code-input').value = '';
        showStatus('已清空', 'ok');
    });

    // 下载题面
    document.getElementById('btn-download').addEventListener('click', function() {
        downloadProblem();
    });

    // 强制让 textarea 支持粘贴
    const codeInput = document.getElementById('code-input');
    codeInput.addEventListener('paste', function(e) {
        e.stopPropagation();
    }, true);
    codeInput.addEventListener('keydown', function(e) {
        // 拦截 Ctrl+V，手动读取剪贴板写入
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            e.stopPropagation();
            e.preventDefault();
            navigator.clipboard.readText().then(function(text) {
                const start = codeInput.selectionStart;
                const end = codeInput.selectionEnd;
                const value = codeInput.value;
                codeInput.value = value.slice(0, start) + text + value.slice(end);
                codeInput.selectionStart = codeInput.selectionEnd = start + text.length;
            });
        }
    }, true);
}

function injectCode(code) {
    window.postMessage({ source: 'paste-helper', action: 'injectCode', code: code }, '*');

    // 监听响应
    function onResponse(e) {
        if (!e.data || e.data.source !== 'paste-helper-response' || e.data.action !== 'injectCode') return;
        window.removeEventListener('message', onResponse);
        if (e.data.success) {
            showStatus('注入成功', 'ok');
        } else {
            // 回退到 execCommand
            try {
                const textarea = document.querySelector('.inputarea.monaco-mouse-cursor-text');
                if (textarea) {
                    textarea.focus();
                    document.execCommand('selectAll', false, null);
                    document.execCommand('insertText', false, code);
                    showStatus('注入成功 (execCommand)', 'ok');
                    return;
                }
            } catch(err) {}
            showStatus('注入失败', 'err');
        }
    }
    window.addEventListener('message', onResponse);
}

function readCode() {
    window.postMessage({ source: 'paste-helper', action: 'readCode' }, '*');

    function onResponse(e) {
        if (!e.data || e.data.source !== 'paste-helper-response' || e.data.action !== 'readCode') return;
        window.removeEventListener('message', onResponse);
        if (e.data.code) {
            document.getElementById('code-input').value = e.data.code;
            showStatus('已读取编辑器代码', 'ok');
        } else {
            showStatus('读取失败，未找到编辑器', 'err');
        }
    }
    window.addEventListener('message', onResponse);
}

function downloadProblem() {
    const panel = document.querySelector('.tab-panel-body___iueV_');
    if (!panel) {
        showStatus('未找到题面内容', 'err');
        return;
    }
    showStatus('正在获取代码...', 'warn');

    const title = getTitle();
    const folderName = (title || '题面').replace(/[\\/:*?"<>|]/g, '_');

    // 通过 postMessage 获取编辑器代码
    window.postMessage({ source: 'paste-helper', action: 'readCode' }, '*');

    function onResponse(e) {
        if (!e.data || e.data.source !== 'paste-helper-response' || e.data.action !== 'readCode') return;
        window.removeEventListener('message', onResponse);

        const editorCode = e.data.code || '';

        // 收集所有图片
        const imgs = panel.querySelectorAll('img');
        const imgMap = {};
        let imgIndex = 0;

        imgs.forEach(img => {
            const src = img.getAttribute('src');
            if (!src || src.startsWith('data:')) return;
            imgIndex++;
            const ext = getImageExt(src);
            const filename = 'img_' + imgIndex + ext;
            imgMap[src] = filename;
        });

        // 下载图片文件
        Object.entries(imgMap).forEach(([url, filename]) => {
            chrome.runtime.sendMessage({
                action: 'downloadFile',
                url: url,
                filename: folderName + '/' + filename
            });
        });

        // 生成 markdown
        let md = '# ' + title + '\n\n';
        md += htmlToMarkdown(panel, imgMap);
        if (editorCode.trim()) {
            md += '\n---\n\n## 初始代码\n\n```python\n' + editorCode.trimEnd() + '\n```\n';
        }

        // 下载 md 文件
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        chrome.runtime.sendMessage({
            action: 'downloadFile',
            url: blobUrl,
            filename: folderName + '/' + folderName + '.md'
        });

        showStatus('题面和图片已下载到 ' + folderName + ' 文件夹', 'ok');
    }
    window.addEventListener('message', onResponse);
}

function getImageExt(url) {
    const match = url.match(/\.(png|jpg|jpeg|gif|webp|svg)/i);
    if (match) return '.' + match[1].toLowerCase();
    return '.png';
}

function fetchImageAsBase64(url) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchImage', url: url }, function(response) {
            if (response && response.success) {
                resolve(response.data);
            } else {
                reject();
            }
        });
    });
}

function getTitle() {
    const h3 = document.querySelector('.task-header h3');
    if (h3) return h3.textContent.trim();
    const h2 = document.querySelector('.shixun-info div div');
    if (h2) return h2.textContent.trim();
    return '题面';
}

function htmlToMarkdown(container, imgMap) {
    let md = '';
    const children = container.children;
    for (let i = 0; i < children.length; i++) {
        md += processNode(children[i], imgMap);
    }
    return md.replace(/\n{3,}/g, '\n\n');
}

function processNode(node, imgMap) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';

    const tag = node.tagName.toLowerCase();

    if (tag === 'h1') return '# ' + node.textContent.trim() + '\n\n';
    if (tag === 'h2') return '## ' + node.textContent.trim() + '\n\n';
    if (tag === 'h3') return '### ' + node.textContent.trim() + '\n\n';
    if (tag === 'h4') return '#### ' + node.textContent.trim() + '\n\n';
    if (tag === 'h5') return '##### ' + node.textContent.trim() + '\n\n';
    if (tag === 'hr') return '\n---\n\n';

    if (tag === 'p') return processInline(node, imgMap) + '\n\n';

    if (tag === 'pre') return processCodeBlock(node) + '\n\n';

    if (tag === 'code' && node.parentElement.tagName.toLowerCase() !== 'pre') {
        return '`' + node.textContent + '`';
    }

    if (tag === 'ul') return processUl(node, imgMap) + '\n';
    if (tag === 'ol') return processOl(node, imgMap) + '\n';

    if (tag === 'img') {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        const localName = imgMap[src] || src;
        return '![' + alt.trim() + '](' + localName + ')';
    }

    if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        return '[' + node.textContent.trim() + '](' + href + ')';
    }

    if (tag === 'strong' || tag === 'b') return '**' + node.textContent + '**';
    if (tag === 'em' || tag === 'i') return '*' + node.textContent + '*';

    if (tag === 'div' || tag === 'section' || tag === 'span') {
        let result = '';
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            if (child.nodeType === 3) result += child.textContent;
            else if (child.nodeType === 1) result += processNode(child, imgMap);
        }
        return result;
    }

    return node.textContent;
}

function processInline(node, imgMap) {
    let result = '';
    for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeType === 3) {
            result += child.textContent;
        } else if (child.nodeType === 1) {
            const tag = child.tagName.toLowerCase();
            if (tag === 'img') {
                const alt = child.getAttribute('alt') || '';
                const src = child.getAttribute('src') || '';
                const localName = (imgMap && imgMap[src]) || src;
                result += '![' + alt.trim() + '](' + localName + ')';
            } else if (tag === 'a') {
                const href = child.getAttribute('href') || '';
                result += '[' + child.textContent.trim() + '](' + href + ')';
            } else if (tag === 'code') {
                result += '`' + child.textContent + '`';
            } else if (tag === 'strong' || tag === 'b') {
                result += '**' + child.textContent + '**';
            } else if (tag === 'em' || tag === 'i') {
                result += '*' + child.textContent + '*';
            } else if (tag === 'br') {
                result += '\n';
            } else {
                result += processInline(child, imgMap);
            }
        }
    }
    return result;
}

function processCodeBlock(node) {
    const codeEl = node.querySelector('code');
    let lang = '';
    if (codeEl) {
        const cls = codeEl.className || '';
        const match = cls.match(/language-(\w+)/);
        if (match) lang = match[1];
    }
    const lines = node.querySelectorAll('li');
    let code = '';
    if (lines.length > 0) {
        lines.forEach(line => { code += line.textContent + '\n'; });
    } else {
        code = node.textContent;
    }
    return '```' + lang + '\n' + code.trimEnd() + '\n```';
}

function processUl(node, imgMap) {
    let result = '';
    const items = node.querySelectorAll(':scope > li');
    items.forEach(item => {
        result += '- ' + processInline(item, imgMap).trim() + '\n';
        const subUl = item.querySelector(':scope > ul');
        if (subUl) {
            const subItems = subUl.querySelectorAll(':scope > li');
            subItems.forEach(sub => {
                result += '  - ' + processInline(sub, imgMap).trim() + '\n';
            });
        }
    });
    return result;
}

function processOl(node, imgMap) {
    let result = '';
    const items = node.querySelectorAll(':scope > li');
    items.forEach((item, idx) => {
        result += (idx + 1) + '. ' + processInline(item, imgMap).trim() + '\n';
    });
    return result;
}

function showStatus(msg, type) {
    const el = document.getElementById('panel-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === 'ok' ? '#a6e3a1' : type === 'warn' ? '#f9e2af' : '#f38ba8';
    setTimeout(() => { el.textContent = ''; }, 3000);
}

function makeDraggable(el) {
    const header = el.querySelector('#panel-header');
    let isDragging = false, startX, startY, initX, initY;

    header.addEventListener('mousedown', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        if (el.classList.contains('minimized')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        initX = rect.left;
        initY = rect.top;
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
    });

    function onDrag(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = (initX + dx) + 'px';
        el.style.top = (initY + dy) + 'px';
        el.style.right = 'auto';
    }

    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
    }
}
