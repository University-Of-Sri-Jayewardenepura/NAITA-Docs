import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  InputRenderable,
  InputRenderableEvents,
  type CliRenderer,
  type KeyEvent,
} from '@opentui/core';

export type Choice = { name: string; description?: string; action: () => void | Promise<void> };
type Field = { key: string; label: string; value?: string; optional?: boolean };

export class DiaryShell {
  private panel: BoxRenderable;
  private title: TextRenderable;
  private detail: TextRenderable;
  private menu: SelectRenderable;
  private input: InputRenderable;
  private feedback: TextRenderable;
  private choices: Choice[] = [];
  private onSubmit: (value: string) => void | Promise<void> = () => {};
  private back: () => void | Promise<void> = () => {};
  private busy = false;

  constructor(readonly renderer: CliRenderer) {
    this.panel = new BoxRenderable(renderer, {
      id: 'diary-panel',
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      padding: 1,
      gap: 1,
      border: true,
      borderStyle: 'rounded',
      borderColor: '#5f89c7',
      backgroundColor: '#10131a',
    });
    this.title = new TextRenderable(renderer, {
      id: 'screen-title',
      content: 'NAITA internship diary',
      fg: '#7fdbff',
      flexShrink: 0,
    });
    this.detail = new TextRenderable(renderer, {
      id: 'screen-detail',
      content: '',
      fg: '#c4cfdd',
      flexShrink: 0,
      maxHeight: 7,
    });
    this.menu = new SelectRenderable(renderer, {
      id: 'screen-menu',
      flexGrow: 1,
      minHeight: 3,
      options: [],
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,
      textColor: '#e5ecf4',
      selectedTextColor: '#ffffff',
      selectedBackgroundColor: '#2b3850',
      descriptionColor: '#9daec4',
      selectedDescriptionColor: '#c4cfdd',
    });
    this.input = new InputRenderable(renderer, {
      id: 'screen-input',
      width: '100%',
      visible: false,
      backgroundColor: '#202838',
      focusedBackgroundColor: '#2b3850',
      textColor: '#ffffff',
      maxLength: 5000,
    });
    this.feedback = new TextRenderable(renderer, {
      id: 'screen-feedback',
      content: '',
      fg: '#76d7a2',
      flexShrink: 0,
      maxHeight: 4,
    });
    const footer = new TextRenderable(renderer, {
      id: 'screen-footer',
      content: 'Up/Down: choose   Enter: open/save   Esc: back   Ctrl+C: exit',
      fg: '#9daec4',
      flexShrink: 0,
    });
    for (const child of [this.title, this.detail, this.menu, this.input, this.feedback, footer]) this.panel.add(child);
    renderer.root.add(this.panel);
    this.menu.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      if (!this.busy) void this.perform(() => this.choices[index]?.action());
    });
    this.input.on(InputRenderableEvents.ENTER, (value: string) => {
      if (!this.busy) void this.perform(() => this.onSubmit(value));
    });
    const onKey = (key: KeyEvent) => {
      if (key.name === 'escape' && !this.busy) {
        key.preventDefault();
        void this.perform(this.back);
      }
      if (key.ctrl && key.name === 'c') {
        key.preventDefault();
        renderer.destroy();
      }
    };
    renderer.keyInput.on('keypress', onKey);
    renderer.once('destroy', () => renderer.keyInput.off('keypress', onKey));
  }
  async perform(action: () => void | Promise<void>) {
    if (this.busy || this.renderer.isDestroyed) return;
    this.busy = true;
    this.feedback.content = 'Working...';
    try {
      await action();
      if (!this.renderer.isDestroyed) {
        this.feedback.content = '';
        this.feedback.fg = '#76d7a2';
      }
    } catch (error) {
      if (!this.renderer.isDestroyed) {
        this.feedback.content = error instanceof Error ? error.message : String(error);
        this.feedback.fg = '#ff8a8a';
      }
    } finally {
      this.busy = false;
    }
  }
  show(title: string, detail: string, choices: Choice[], back: () => void | Promise<void>) {
    if (this.renderer.isDestroyed) return;
    this.title.content = title;
    this.detail.content = detail;
    this.choices = choices;
    this.back = back;
    this.input.visible = false;
    this.menu.visible = true;
    this.menu.options = choices.map((choice) => ({ name: choice.name, description: choice.description || '' }));
    this.menu.setSelectedIndex(0);
    this.menu.focus();
  }
  form(
    title: string,
    fields: Field[],
    save: (values: Record<string, string>) => Promise<void>,
    back: () => void | Promise<void>,
  ) {
    let index = 0;
    const values: Record<string, string> = {};
    const showField = () => {
      const field = fields[index];
      this.title.content = `${title} (${index + 1}/${fields.length})`;
      this.detail.content = `${field.label}${field.optional ? '\nLeave blank if not needed; an existing value can be cleared.' : ''}`;
      this.menu.visible = false;
      this.input.visible = true;
      this.input.value = values[field.key] ?? field.value ?? '';
      this.input.focus();
    };
    this.back = () => {
      if (index === 0) return back();
      values[fields[index].key] = this.input.value;
      index -= 1;
      showField();
    };
    this.onSubmit = async (value) => {
      const field = fields[index];
      if (!field.optional && !value.trim()) throw new Error(`${field.label} is required.`);
      values[field.key] = value.trim();
      if (index === fields.length - 1) await save(values);
      else {
        index += 1;
        showField();
      }
    };
    showField();
  }
}
