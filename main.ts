import { Plugin } from 'obsidian';

export default class GrimoirePlugin extends Plugin {
  async onload() {
    console.log('Grimoire plugin loaded');
  }

  onunload() {
    console.log('Grimoire plugin unloaded');
  }
}
