import type { App, TFile } from 'obsidian';

export interface ContextNotesInputProps {
  app: App;
  onChange: (paths: readonly string[]) => void;
}

export class ContextNotesInput {
  #pillPaths: string[] = [];
  #searchInput: HTMLInputElement | null = null;
  #pillContainer: HTMLElement | null = null;
  #dropdown: HTMLElement | null = null;
  #props: ContextNotesInputProps | null = null;

  mount(parent: HTMLElement, props: ContextNotesInputProps): void {
    this.#props = props;

    this.#pillContainer = document.createElement('div');
    this.#pillContainer.className = 'context-notes-pills';
    parent.appendChild(this.#pillContainer);

    this.#searchInput = document.createElement('input');
    this.#searchInput.type = 'text';
    this.#searchInput.className = 'context-notes-search';
    parent.appendChild(this.#searchInput);

    this.#dropdown = document.createElement('div');
    this.#dropdown.className = 'context-notes-dropdown';
    parent.appendChild(this.#dropdown);

    this.#searchInput.addEventListener('input', () => {
      this.#rebuildDropdown(this.#searchInput!.value);
    });

    // Esc must bubble — no stopPropagation
    this.#searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
      // Backspace on empty field is a no-op (do not remove last pill)
      if (e.key === 'Backspace' && this.#searchInput!.value === '') {
        e.preventDefault();
      }
    });
  }

  #rebuildDropdown(query: string): void {
    if (!this.#dropdown || !this.#props) return;
    this.#dropdown.innerHTML = '';

    if (!query) return;

    const files: TFile[] = this.#props.app.vault.getMarkdownFiles();
    const q = query.toLowerCase();
    const matches = files
      .filter((f) => f.basename.toLowerCase().includes(q))
      .filter((f) => !this.#pillPaths.includes(f.path))
      .slice(0, 6);

    for (const file of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = file.basename;
      btn.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        this.#addPill(file.path, file.basename);
      });
      this.#dropdown.appendChild(btn);
    }
  }

  #addPill(path: string, basename: string): void {
    this.#renderPill(path, basename);

    if (this.#searchInput) this.#searchInput.value = '';
    this.#rebuildDropdown('');

    this.#props!.onChange([...this.#pillPaths]);
  }

  // Render a pill element for the given path/basename and track it in pillPaths.
  // Does not fire onChange — caller decides whether to notify.
  #renderPill(path: string, basename: string): void {
    this.#pillPaths.push(path);

    const pill = document.createElement('span');
    pill.className = 'context-notes-pill';

    const label = document.createElement('span');
    label.textContent = basename;
    pill.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('data-pill-remove', path);
    removeBtn.addEventListener('click', () => {
      this.#removePill(path, pill);
    });
    pill.appendChild(removeBtn);

    this.#pillContainer!.appendChild(pill);
  }

  #removePill(path: string, pillEl: HTMLElement): void {
    this.#pillPaths = this.#pillPaths.filter((p) => p !== path);
    pillEl.remove();
    this.#props!.onChange([...this.#pillPaths]);
  }

  getPaths(): readonly string[] {
    return [...this.#pillPaths];
  }

  // Programmatic restore: replace all pills with the given paths without
  // firing onChange (formState already holds the correct paths from session).
  addPaths(paths: readonly string[]): void {
    this.#pillPaths = [];
    if (this.#pillContainer) this.#pillContainer.innerHTML = '';

    for (const path of paths) {
      const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
      this.#renderPill(path, basename);
    }
  }

  clear(): void {
    this.#pillPaths = [];
    if (this.#pillContainer) this.#pillContainer.innerHTML = '';
    if (this.#searchInput) this.#searchInput.value = '';
    if (this.#dropdown) this.#dropdown.innerHTML = '';
    if (this.#props) this.#props.onChange([]);
  }

  focus(): void {
    this.#searchInput?.focus();
  }

  detach(): void {
    this.#searchInput?.remove();
    this.#pillContainer?.remove();
    this.#dropdown?.remove();
    this.#searchInput = null;
    this.#pillContainer = null;
    this.#dropdown = null;
    this.#props = null;
  }
}
