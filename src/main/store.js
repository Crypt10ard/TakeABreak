'use strict';

const fs = require('fs');
const path = require('path');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(base?.[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

/** A small JSON file with debounced, atomic writes (write to .tmp, then rename). */
class JsonFile {
  constructor(file, defaults = {}) {
    this.file = file;
    this.existed = fs.existsSync(file);
    this.data = deepMerge(defaults, this.#read());
    this.timer = null;
  }

  #read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  save({ immediate = false } = {}) {
    clearTimeout(this.timer);
    if (immediate) return this.#write();
    this.timer = setTimeout(() => this.#write(), 400);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.#write();
    }
  }

  #write() {
    this.timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] could not write', this.file, err);
    }
  }
}

module.exports = { JsonFile, deepMerge };
