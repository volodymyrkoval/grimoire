import { Plugin } from 'obsidian';
import {CommandPopup} from './ui/CommandPopup';

export default class GrimoirePlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: 'open-command-popup',
      name: 'Open Grimoire',
      callback: () => new CommandPopup(this.app).open(),
    });
  }

  onunload() {
    console.log('Grimoire plugin unloaded');
  }
}
