// admin/js/rich-editor.js
// A small formatted-text editor with no dependencies. The server cleans whatever
// it receives (services/richText.js), so this only needs to be pleasant to use.

class RichEditor {
  constructor(container, { onChange, minHeight = 220 } = {}) {
    this.onChange = onChange;
    this.savedRange = null;
    const tool = (cmd, label, content, value) => `<button type="button" class="re-tool" data-cmd="${cmd}" ${value ? `data-value="${value}"` : ''} title="${label}" aria-label="${label}">${content}</button>`;
    container.innerHTML = `<div class="re">
      <div class="re-toolbar" role="toolbar" aria-label="Formatting">
        ${tool('bold', 'Bold', '<b>B</b>')}${tool('italic', 'Italic', '<i>I</i>')}${tool('underline', 'Underline', '<u>U</u>')}
        <span class="re-sep"></span>
        ${tool('formatBlock', 'Heading', 'H2', 'H2')}${tool('formatBlock', 'Subheading', 'H3', 'H3')}${tool('formatBlock', 'Paragraph', '¶', 'P')}
        <span class="re-sep"></span>
        ${tool('insertUnorderedList', 'Bullet list', '•&nbsp;List')}${tool('insertOrderedList', 'Numbered list', '1.&nbsp;List')}
        <span class="re-sep"></span>
        ${tool('justifyLeft', 'Align left', '⇤')}${tool('justifyCenter', 'Align centre', '↔')}${tool('justifyRight', 'Align right', '⇥')}
        <span class="re-sep"></span>
        ${tool('link', 'Add link', 'Link')}${tool('unlink', 'Remove link', 'Unlink')}
        <span class="re-sep"></span>
        ${tool('undo', 'Undo', '↶')}${tool('redo', 'Redo', '↷')}${tool('clear', 'Clear formatting', 'Clear')}
      </div>
      <div class="re-content" contenteditable="true" role="textbox" aria-multiline="true" style="min-height:${minHeight}px"></div>
    </div>`;
    this.content = container.querySelector('.re-content');
    container.querySelector('.re-toolbar').addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
    container.querySelector('.re-toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (btn) this.command(btn.dataset.cmd, btn.dataset.value);
    });
    this.content.addEventListener('input', () => this.changed());
    this.content.addEventListener('paste', (e) => {
      // Pasted web pages bring messy styling: keep the words
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }

  changed() {
    if (this.onChange) this.onChange();
  }

  command(cmd, value) {
    this.content.focus();
    if (cmd === 'link') {
      const url = window.prompt('Link address (https://…)');
      if (!url) return;
      if (!/^(https?:|mailto:|tel:)/i.test(url)) return toast('Links must start with https://', 'error');
      document.execCommand('createLink', false, url);
    } else if (cmd === 'clear') {
      document.execCommand('removeFormat');
      document.execCommand('formatBlock', false, 'P');
    } else if (cmd === 'formatBlock') {
      document.execCommand('formatBlock', false, value);
    } else {
      document.execCommand(cmd);
    }
    this.changed();
    return undefined;
  }

  getHTML() {
    return this.content.innerHTML.trim();
  }

  setHTML(html) {
    this.content.innerHTML = html || '';
  }

  /** Remembers the selected text before focus moves to a button or dialog. */
  captureSelection() {
    const selection = window.getSelection();
    this.savedRange = null;
    if (selection && selection.rangeCount && !selection.isCollapsed && this.content.contains(selection.anchorNode) && this.content.contains(selection.focusNode)) {
      this.savedRange = selection.getRangeAt(0).cloneRange();
    }
    return !!this.savedRange;
  }

  selectedHTML() {
    if (!this.savedRange) return '';
    const holder = document.createElement('div');
    holder.append(this.savedRange.cloneContents());
    return holder.innerHTML;
  }

  /** Puts approved text back: over the remembered selection, or the whole text. */
  applySuggestion(html) {
    if (this.savedRange) {
      this.savedRange.deleteContents();
      const template = document.createElement('template');
      template.innerHTML = html;
      this.savedRange.insertNode(template.content);
      this.savedRange = null;
    } else {
      this.setHTML(html);
    }
    this.changed();
  }
}

/** Old descriptions are plain text with line breaks: shows them as paragraphs. */
function plainTextToHtml(text) {
  return String(text || '').split(/\r?\n\s*\r?\n|\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}
