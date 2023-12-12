var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/vec_lite.js
var require_vec_lite = __commonJS({
  "src/vec_lite.js"(exports2, module2) {
    module2.exports = class VecLite {
      constructor(config) {
        this.config = {
          file_name: "embeddings-3.json",
          folder_path: ".vec_lite",
          exists_adapter: null,
          mkdir_adapter: null,
          read_adapter: null,
          rename_adapter: null,
          stat_adapter: null,
          write_adapter: null,
          ...config
        };
        this.file_name = this.config.file_name;
        this.folder_path = config.folder_path;
        this.file_path = this.folder_path + "/" + this.file_name;
        this.embeddings = false;
      }
      async file_exists(path) {
        if (this.config.exists_adapter) {
          return await this.config.exists_adapter(path);
        } else {
          throw new Error("exists_adapter not set");
        }
      }
      async mkdir(path) {
        if (this.config.mkdir_adapter) {
          return await this.config.mkdir_adapter(path);
        } else {
          throw new Error("mkdir_adapter not set");
        }
      }
      async read_file(path) {
        if (this.config.read_adapter) {
          return await this.config.read_adapter(path);
        } else {
          throw new Error("read_adapter not set");
        }
      }
      async rename(old_path, new_path) {
        if (this.config.rename_adapter) {
          return await this.config.rename_adapter(old_path, new_path);
        } else {
          throw new Error("rename_adapter not set");
        }
      }
      async stat(path) {
        if (this.config.stat_adapter) {
          return await this.config.stat_adapter(path);
        } else {
          throw new Error("stat_adapter not set");
        }
      }
      async write_file(path, data) {
        if (this.config.write_adapter) {
          return await this.config.write_adapter(path, data);
        } else {
          throw new Error("write_adapter not set");
        }
      }
      async load(retries = 0) {
        try {
          const embeddings_file = await this.read_file(this.file_path);
          this.embeddings = JSON.parse(embeddings_file);
          console.log("loaded embeddings file: " + this.file_path);
          return true;
        } catch (error) {
          if (retries < 3) {
            console.log("retrying load()");
            await new Promise((r) => setTimeout(r, 1e3 + 1e3 * retries));
            return await this.load(retries + 1);
          } else if (retries === 3) {
            const embeddings_2_file_path = this.folder_path + "/embeddings-2.json";
            const embeddings_2_file_exists = await this.file_exists(embeddings_2_file_path);
            if (embeddings_2_file_exists) {
              await this.migrate_embeddings_v2_to_v3();
              return await this.load(retries + 1);
            }
          }
          console.log("failed to load embeddings file, prompt user to initiate bulk embed");
          await init_embeddings_file();
          return false;
        }
      }
      async migrate_embeddings_v2_to_v3() {
        console.log("migrating embeddings-2.json to embeddings-3.json");
        const embeddings_2_file_path = this.folder_path + "/embeddings-2.json";
        const embeddings_2_file = await this.read_file(embeddings_2_file_path);
        const embeddings_2 = JSON.parse(embeddings_2_file);
        const embeddings_3 = {};
        for (const [key, value] of Object.entries(embeddings_2)) {
          const new_obj = {
            vec: value.vec,
            meta: {}
          };
          const meta = value.meta;
          const new_meta = {};
          if (meta.hash)
            new_meta.hash = meta.hash;
          if (meta.file)
            new_meta.parent = meta.file;
          if (meta.blocks)
            new_meta.children = meta.blocks;
          if (meta.mtime)
            new_meta.mtime = meta.mtime;
          if (meta.size)
            new_meta.size = meta.size;
          if (meta.len)
            new_meta.size = meta.len;
          if (meta.path)
            new_meta.path = meta.path;
          new_meta.src = "file";
          new_obj.meta = new_meta;
          embeddings_3[key] = new_obj;
        }
        const embeddings_3_file = JSON.stringify(embeddings_3);
        await this.write_file(this.file_path, embeddings_3_file);
      }
      async init_embeddings_file() {
        if (!await this.file_exists(this.folder_path)) {
          await this.mkdir(this.folder_path);
          console.log("created folder: " + this.folder_path);
        } else {
          console.log("folder already exists: " + this.folder_path);
        }
        if (!await this.file_exists(this.file_path)) {
          await this.write_file(this.file_path, "{}");
          console.log("created embeddings file: " + this.file_path);
        } else {
          console.log("embeddings file already exists: " + this.file_path);
        }
      }
      async save() {
        const embeddings = JSON.stringify(this.embeddings);
        const embeddings_file_exists = await this.file_exists(this.file_path);
        if (embeddings_file_exists) {
          const new_file_size = embeddings.length;
          const existing_file_size = await this.stat(this.file_path).then((stat) => stat.size);
          if (new_file_size > existing_file_size * 0.5) {
            await this.write_file(this.file_path, embeddings);
            console.log("embeddings file size: " + new_file_size + " bytes");
          } else {
            const warning_message = [
              "Warning: New embeddings file size is significantly smaller than existing embeddings file size.",
              "Aborting to prevent possible loss of embeddings data.",
              "New file size: " + new_file_size + " bytes.",
              "Existing file size: " + existing_file_size + " bytes.",
              "Restarting Obsidian may fix this."
            ];
            console.log(warning_message.join(" "));
            await this.write_file(this.folder_path + "/unsaved-embeddings.json", embeddings);
            throw new Error("Error: New embeddings file size is significantly smaller than existing embeddings file size. Aborting to prevent possible loss of embeddings data.");
          }
        } else {
          await this.init_embeddings_file();
          return await this.save();
        }
        return true;
      }
      cos_sim(vector1, vector2) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vector1.length; i++) {
          dotProduct += vector1[i] * vector2[i];
          normA += vector1[i] * vector1[i];
          normB += vector2[i] * vector2[i];
        }
        if (normA === 0 || normB === 0) {
          return 0;
        } else {
          return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        }
      }
      nearest(to_vec, filter = {}) {
        filter = {
          results_count: 30,
          ...filter
        };
        let nearest = [];
        const from_keys = Object.keys(this.embeddings);
        for (let i = 0; i < from_keys.length; i++) {
          if (filter.skip_sections) {
            const from_path = this.embeddings[from_keys[i]].meta.path;
            if (from_path.indexOf("#") > -1)
              continue;
          }
          if (filter.skip_key) {
            if (filter.skip_key === from_keys[i])
              continue;
            if (filter.skip_key === this.embeddings[from_keys[i]].meta.parent)
              continue;
          }
          if (filter.path_begins_with) {
            if (typeof filter.path_begins_with === "string" && !this.embeddings[from_keys[i]].meta.path.startsWith(filter.path_begins_with))
              continue;
            if (Array.isArray(filter.path_begins_with) && !filter.path_begins_with.some((path) => this.embeddings[from_keys[i]].meta.path.startsWith(path)))
              continue;
          }
          nearest.push({
            link: this.embeddings[from_keys[i]].meta.path,
            similarity: this.cos_sim(to_vec, this.embeddings[from_keys[i]].vec),
            size: this.embeddings[from_keys[i]].meta.size
          });
        }
        nearest.sort(function(a, b) {
          return b.similarity - a.similarity;
        });
        nearest = nearest.slice(0, filter.results_count);
        return nearest;
      }
      find_nearest_embeddings(to_vec, filter = {}) {
        const default_filter = {
          max: this.max_sources
        };
        filter = { ...default_filter, ...filter };
        if (Array.isArray(to_vec) && to_vec.length !== this.vec_len) {
          this.nearest = {};
          for (let i = 0; i < to_vec.length; i++) {
            this.find_nearest_embeddings(to_vec[i], {
              max: Math.floor(filter.max / to_vec.length)
            });
          }
        } else {
          const from_keys = Object.keys(this.embeddings);
          for (let i = 0; i < from_keys.length; i++) {
            if (this.validate_type(this.embeddings[from_keys[i]]))
              continue;
            const sim = this.computeCosineSimilarity(to_vec, this.embeddings[from_keys[i]].vec);
            if (this.nearest[from_keys[i]]) {
              this.nearest[from_keys[i]] += sim;
            } else {
              this.nearest[from_keys[i]] = sim;
            }
          }
        }
        let nearest = Object.keys(this.nearest).map((key) => {
          return {
            key,
            similarity: this.nearest[key]
          };
        });
        nearest = this.sort_by_similarity(nearest);
        nearest = nearest.slice(0, filter.max);
        nearest = nearest.map((item) => {
          return {
            link: this.embeddings[item.key].meta.path,
            similarity: item.similarity,
            len: this.embeddings[item.key].meta.len || this.embeddings[item.key].meta.size
          };
        });
        return nearest;
      }
      sort_by_similarity(nearest) {
        return nearest.sort(function(a, b) {
          const a_score = a.similarity;
          const b_score = b.similarity;
          if (a_score > b_score)
            return -1;
          if (a_score < b_score)
            return 1;
          return 0;
        });
      }
      // check if key from embeddings exists in files
      clean_up_embeddings(files) {
        console.log("cleaning up embeddings");
        const keys = Object.keys(this.embeddings);
        let deleted_embeddings = 0;
        for (const key of keys) {
          const path = this.embeddings[key].meta.path;
          if (!files.find((file) => path.startsWith(file.path))) {
            delete this.embeddings[key];
            deleted_embeddings++;
            continue;
          }
          if (path.indexOf("#") > -1) {
            const parent_key = this.embeddings[key].meta.parent;
            if (!this.embeddings[parent_key]) {
              delete this.embeddings[key];
              deleted_embeddings++;
              continue;
            }
            if (!this.embeddings[parent_key].meta) {
              delete this.embeddings[key];
              deleted_embeddings++;
              continue;
            }
            if (this.embeddings[parent_key].meta.children && this.embeddings[parent_key].meta.children.indexOf(key) < 0) {
              delete this.embeddings[key];
              deleted_embeddings++;
              continue;
            }
          }
        }
        return { deleted_embeddings, total_embeddings: keys.length };
      }
      get(key) {
        return this.embeddings[key] || null;
      }
      get_meta(key) {
        const embedding = this.get(key);
        if (embedding && embedding.meta) {
          return embedding.meta;
        }
        return null;
      }
      get_mtime(key) {
        const meta = this.get_meta(key);
        if (meta && meta.mtime) {
          return meta.mtime;
        }
        return null;
      }
      get_hash(key) {
        const meta = this.get_meta(key);
        if (meta && meta.hash) {
          return meta.hash;
        }
        return null;
      }
      get_size(key) {
        const meta = this.get_meta(key);
        if (meta && meta.size) {
          return meta.size;
        }
        return null;
      }
      get_children(key) {
        const meta = this.get_meta(key);
        if (meta && meta.children) {
          return meta.children;
        }
        return null;
      }
      get_vec(key) {
        const embedding = this.get(key);
        if (embedding && embedding.vec) {
          return embedding.vec;
        }
        return null;
      }
      save_embedding(key, vec, meta) {
        this.embeddings[key] = {
          vec,
          meta
        };
      }
      mtime_is_current(key, source_mtime) {
        const mtime = this.get_mtime(key);
        if (mtime && mtime >= source_mtime) {
          return true;
        }
        return false;
      }
      async force_refresh() {
        this.embeddings = null;
        this.embeddings = {};
        let current_datetime = Math.floor(Date.now() / 1e3);
        await this.rename(this.file_path, this.folder_path + "/embeddings-" + current_datetime + ".json");
        await this.init_embeddings_file();
      }
    };
  }
});

// src/index.js
var Obsidian = require("obsidian");
var VecLite = require_vec_lite();
var DEFAULT_SETTINGS = {
  file_exclusions: "",
  folder_exclusions: "",
  header_exclusions: "",
  path_only: "",
  show_full_path: false,
  expanded_view: true,
  group_nearest_by_file: false,
  language: "en",
  log_render: false,
  log_render_files: false,
  recently_sent_retry_notice: false,
  skip_sections: false,
  view_open: true,
  version: ""
};
var MAX_EMBED_STRING_LENGTH = 25e3;
var VERSION;
var SUPPORTED_FILE_TYPES = ["md", "canvas"];
var crypto = require("crypto");
function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}
var SmartConnectionsPlugin = class extends Obsidian.Plugin {
  // constructor
  constructor() {
    super(...arguments);
    this.api = null;
    this.embeddings_loaded = false;
    this.file_exclusions = [];
    this.folders = [];
    this.has_new_embeddings = false;
    this.header_exclusions = [];
    this.nearest_cache = {};
    this.path_only = [];
    this.render_log = {};
    this.render_log.deleted_embeddings = 0;
    this.render_log.exclusions_logs = {};
    this.render_log.failed_embeddings = [];
    this.render_log.files = [];
    this.render_log.new_embeddings = 0;
    this.render_log.skipped_low_delta = {};
    this.render_log.token_usage = 0;
    this.render_log.tokens_saved_by_cache = 0;
    this.retry_notice_timeout = null;
    this.save_timeout = null;
    this.sc_branding = {};
    this.self_ref_kw_regex = null;
    this.update_available = false;
  }
  async onload() {
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
  }
  onunload() {
    this.output_render_log();
    console.log("unloading plugin");
    this.app.workspace.detachLeavesOfType(SMART_CONNECTIONS_VIEW_TYPE);
  }
  async initialize() {
    console.log("Loading Smart Connections plugin");
    VERSION = this.manifest.version;
    await this.loadSettings();
    this.initializeProfiles();
    this.addIcon();
    this.addCommand({
      id: "sc-find-notes",
      name: "Find: Make Smart Connections",
      icon: "pencil_icon",
      hotkeys: [],
      // editorCallback: async (editor) => {
      editorCallback: async (editor) => {
        if (editor.somethingSelected()) {
          let selected_text = editor.getSelection();
          await this.make_connections(selected_text);
        } else {
          this.nearest_cache = {};
          await this.make_connections();
        }
      }
    });
    this.addCommand({
      id: "smart-connections-view",
      name: "Open: View Smart Connections",
      callback: () => {
        this.open_view();
      }
    });
    this.addCommand({
      id: "smart-connections-random",
      name: "Open: Random Note from Smart Connections",
      callback: () => {
        this.open_random_note();
      }
    });
    this.addSettingTab(new SmartConnectionsSettingsTab(this.app, this));
    this.registerView(
      SMART_CONNECTIONS_VIEW_TYPE,
      (leaf) => new SmartConnectionsView(leaf, this)
    );
    if (this.settings.view_open) {
      this.open_view();
    }
    if (this.settings.version !== VERSION) {
      this.settings.version = VERSION;
      await this.saveSettings();
      this.open_view();
    }
    this.add_to_gitignore();
    this.api = new ScSearchApi(this.app, this);
    (window["SmartSearchApi"] = this.api) && this.register(() => delete window["SmartSearchApi"]);
  }
  async init_vecs(file_name = "embeddings-3.json") {
    this.smart_vec_lite = new VecLite({
      file_name,
      folder_path: ".smart-connections",
      exists_adapter: this.app.vault.adapter.exists.bind(
        this.app.vault.adapter
      ),
      mkdir_adapter: this.app.vault.adapter.mkdir.bind(this.app.vault.adapter),
      read_adapter: this.app.vault.adapter.read.bind(this.app.vault.adapter),
      rename_adapter: this.app.vault.adapter.rename.bind(
        this.app.vault.adapter
      ),
      stat_adapter: this.app.vault.adapter.stat.bind(this.app.vault.adapter),
      write_adapter: this.app.vault.adapter.write.bind(this.app.vault.adapter)
    });
    this.embeddings_loaded = await this.smart_vec_lite.load();
    return this.embeddings_loaded;
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (this.settings.file_exclusions && this.settings.file_exclusions.length > 0) {
      this.file_exclusions = this.settings.file_exclusions.split(",").map((file) => {
        return file.trim();
      });
    }
    if (this.settings.folder_exclusions && this.settings.folder_exclusions.length > 0) {
      const folder_exclusions = this.settings.folder_exclusions.split(",").map((folder) => {
        folder = folder.trim();
        if (folder.slice(-1) !== "/") {
          return folder + "/";
        } else {
          return folder;
        }
      });
      this.file_exclusions = this.file_exclusions.concat(folder_exclusions);
    }
    if (this.settings.header_exclusions && this.settings.header_exclusions.length > 0) {
      this.header_exclusions = this.settings.header_exclusions.split(",").map((header) => {
        return header.trim();
      });
    }
    if (this.settings.path_only && this.settings.path_only.length > 0) {
      this.path_only = this.settings.path_only.split(",").map((path) => {
        return path.trim();
      });
    }
    await this.load_failed_files();
  }
  async saveSettings(rerender = false) {
    await this.saveData(this.settings);
    await this.loadSettings();
    if (rerender) {
      this.nearest_cache = {};
      await this.make_connections();
    }
  }
  async make_connections(selected_text = null) {
    let view = this.get_view();
    if (!view) {
      await this.open_view();
      view = this.get_view();
    }
    await view.render_connections(selected_text);
  }
  addIcon() {
    Obsidian.addIcon(
      "smart-connections",
      `<path d="M50,20 L80,40 L80,60 L50,100" stroke="currentColor" stroke-width="4" fill="none"/>
    <path d="M30,50 L55,70" stroke="currentColor" stroke-width="5" fill="none"/>
    <circle cx="50" cy="20" r="9" fill="currentColor"/>
    <circle cx="80" cy="40" r="9" fill="currentColor"/>
    <circle cx="80" cy="70" r="9" fill="currentColor"/>
    <circle cx="50" cy="100" r="9" fill="currentColor"/>
    <circle cx="30" cy="50" r="9" fill="currentColor"/>`
    );
  }
  // open random note
  async open_random_note() {
    const curr_file = this.app.workspace.getActiveFile();
    const curr_key = md5(curr_file.path);
    if (typeof this.nearest_cache[curr_key] === "undefined") {
      new Obsidian.Notice(
        "[Smart Connections] No Smart Connections found. Open a note to get Smart Connections."
      );
      return;
    }
    const rand = Math.floor(
      Math.random() * this.nearest_cache[curr_key].length / 2
    );
    const random_file = this.nearest_cache[curr_key][rand];
    this.open_note(random_file);
  }
  async open_view() {
    if (this.get_view()) {
      console.log("Smart Connections view already open");
      return;
    }
    this.app.workspace.detachLeavesOfType(SMART_CONNECTIONS_VIEW_TYPE);
    await this.app.workspace.getRightLeaf(false).setViewState({
      type: SMART_CONNECTIONS_VIEW_TYPE,
      active: true
    });
    this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(SMART_CONNECTIONS_VIEW_TYPE)[0]
    );
  }
  // source: https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md#avoid-managing-references-to-custom-views
  get_view() {
    for (let leaf of this.app.workspace.getLeavesOfType(
      SMART_CONNECTIONS_VIEW_TYPE
    )) {
      if (leaf.view instanceof SmartConnectionsView) {
        return leaf.view;
      }
    }
  }
  // get embeddings for all files
  async get_all_embeddings() {
    const files = (await this.app.vault.getFiles()).filter(
      (file) => file instanceof Obsidian.TFile && (file.extension === "md" || file.extension === "canvas")
    );
    const open_files = this.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view.file);
    const clean_up_log = this.smart_vec_lite.clean_up_embeddings(files);
    if (this.settings.log_render) {
      this.render_log.total_files = files.length;
      this.render_log.deleted_embeddings = clean_up_log.deleted_embeddings;
      this.render_log.total_embeddings = clean_up_log.total_embeddings;
    }
    let batch_promises = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].path.indexOf("#") > -1) {
        this.log_exclusion("path contains #");
        continue;
      }
      if (this.smart_vec_lite.mtime_is_current(
        md5(files[i].path),
        files[i].stat.mtime
      )) {
        continue;
      }
      if (this.settings.failed_files.indexOf(files[i].path) > -1) {
        if (this.retry_notice_timeout) {
          clearTimeout(this.retry_notice_timeout);
          this.retry_notice_timeout = null;
        }
        if (!this.recently_sent_retry_notice) {
          new Obsidian.Notice(
            "Smart Connections: Skipping previously failed file, use button in settings to retry"
          );
          this.recently_sent_retry_notice = true;
          setTimeout(() => {
            this.recently_sent_retry_notice = false;
          }, 6e5);
        }
        continue;
      }
      let skip = false;
      for (let j = 0; j < this.file_exclusions.length; j++) {
        if (files[i].path.indexOf(this.file_exclusions[j]) > -1) {
          skip = true;
          this.log_exclusion(this.file_exclusions[j]);
          break;
        }
      }
      if (skip) {
        continue;
      }
      if (open_files.indexOf(files[i]) > -1) {
        continue;
      }
      try {
        batch_promises.push(this.get_file_embeddings(files[i], false));
      } catch (error) {
        console.log(error);
      }
      if (batch_promises.length > 3) {
        await Promise.all(batch_promises);
        batch_promises = [];
      }
      if (i > 0 && i % 100 === 0) {
        await this.save_embeddings_to_file();
      }
    }
    await Promise.all(batch_promises);
    await this.save_embeddings_to_file();
    if (this.render_log.failed_embeddings.length > 0) {
      await this.save_failed_embeddings();
    }
  }
  async save_embeddings_to_file(force = false) {
    if (!this.has_new_embeddings) {
      return;
    }
    if (!force) {
      if (this.save_timeout) {
        clearTimeout(this.save_timeout);
        this.save_timeout = null;
      }
      this.save_timeout = setTimeout(() => {
        this.save_embeddings_to_file(true);
        if (this.save_timeout) {
          clearTimeout(this.save_timeout);
          this.save_timeout = null;
        }
      }, 3e4);
      console.log("scheduled save");
      return;
    }
    try {
      await this.smart_vec_lite.save();
      this.has_new_embeddings = false;
    } catch (error) {
      console.log(error);
      new Obsidian.Notice("Smart Connections: " + error.message);
    }
  }
  // save failed embeddings to file from render_log.failed_embeddings
  async save_failed_embeddings() {
    let failed_embeddings = [];
    const failed_embeddings_file_exists = await this.app.vault.adapter.exists(
      ".smart-connections/failed-embeddings.txt"
    );
    if (failed_embeddings_file_exists) {
      failed_embeddings = await this.app.vault.adapter.read(
        ".smart-connections/failed-embeddings.txt"
      );
      failed_embeddings = failed_embeddings.split("\r\n");
    }
    failed_embeddings = failed_embeddings.concat(
      this.render_log.failed_embeddings
    );
    failed_embeddings = [...new Set(failed_embeddings)];
    failed_embeddings.sort();
    failed_embeddings = failed_embeddings.join("\r\n");
    await this.app.vault.adapter.write(
      ".smart-connections/failed-embeddings.txt",
      failed_embeddings
    );
    await this.load_failed_files();
  }
  // load failed files from failed-embeddings.txt
  async load_failed_files() {
    const failed_embeddings_file_exists = await this.app.vault.adapter.exists(
      ".smart-connections/failed-embeddings.txt"
    );
    if (!failed_embeddings_file_exists) {
      this.settings.failed_files = [];
      console.log("No failed files.");
      return;
    }
    const failed_embeddings = await this.app.vault.adapter.read(
      ".smart-connections/failed-embeddings.txt"
    );
    const failed_embeddings_array = failed_embeddings.split("\r\n");
    const failed_files = failed_embeddings_array.map((embedding) => embedding.split("#")[0]).reduce(
      (unique, item) => unique.includes(item) ? unique : [...unique, item],
      []
    );
    this.settings.failed_files = failed_files;
  }
  // retry failed embeddings
  async retry_failed_files() {
    this.settings.failed_files = [];
    const failed_embeddings_file_exists = await this.app.vault.adapter.exists(
      ".smart-connections/failed-embeddings.txt"
    );
    if (failed_embeddings_file_exists) {
      await this.app.vault.adapter.remove(
        ".smart-connections/failed-embeddings.txt"
      );
    }
    await this.get_all_embeddings();
  }
  // add .smart-connections to .gitignore to prevent issues with large, frequently updated embeddings file(s)
  async add_to_gitignore() {
    if (!await this.app.vault.adapter.exists(".gitignore")) {
      return;
    }
    let gitignore_file = await this.app.vault.adapter.read(".gitignore");
    if (gitignore_file.indexOf(".smart-connections") < 0) {
      let add_to_gitignore = "\n\n# Ignore Smart Connections folder because embeddings file is large and updated frequently";
      add_to_gitignore += "\n.smart-connections";
      await this.app.vault.adapter.write(
        ".gitignore",
        gitignore_file + add_to_gitignore
      );
      console.log("added .smart-connections to .gitignore");
    }
  }
  // force refresh embeddings file but first rename existing embeddings file to .smart-connections/embeddings-YYYY-MM-DD.json
  async force_refresh_embeddings_file() {
    new Obsidian.Notice(
      "Smart Connections: embeddings file Force Refreshed, making new connections..."
    );
    await this.smart_vec_lite.force_refresh();
    await this.get_all_embeddings();
    this.output_render_log();
    new Obsidian.Notice(
      "Smart Connections: embeddings file Force Refreshed, new connections made."
    );
  }
  // get embeddings for embed_input
  async get_file_embeddings(curr_file, save = true) {
    let req_batch = [];
    let blocks = [];
    const curr_file_key = md5(curr_file.path);
    let file_embed_input = curr_file.path.replace(".md", "");
    file_embed_input = file_embed_input.replace(/\//g, " > ");
    let path_only = false;
    for (let j = 0; j < this.path_only.length; j++) {
      if (curr_file.path.indexOf(this.path_only[j]) > -1) {
        path_only = true;
        console.log("title only file with matcher: " + this.path_only[j]);
        break;
      }
    }
    if (path_only) {
      req_batch.push([
        curr_file_key,
        file_embed_input,
        {
          mtime: curr_file.stat.mtime,
          path: curr_file.path
        }
      ]);
      await this.get_embeddings_batch(req_batch);
      return;
    }
    if (curr_file.extension === "canvas") {
      const canvas_contents = await this.app.vault.cachedRead(curr_file);
      if (typeof canvas_contents === "string" && canvas_contents.indexOf("nodes") > -1) {
        const canvas_json = JSON.parse(canvas_contents);
        for (let j = 0; j < canvas_json.nodes.length; j++) {
          if (canvas_json.nodes[j].text) {
            file_embed_input += "\n" + canvas_json.nodes[j].text;
          }
          if (canvas_json.nodes[j].file) {
            file_embed_input += "\nLink: " + canvas_json.nodes[j].file;
          }
        }
      }
      req_batch.push([
        curr_file_key,
        file_embed_input,
        {
          mtime: curr_file.stat.mtime,
          path: curr_file.path
        }
      ]);
      await this.get_embeddings_batch(req_batch);
      return;
    }
    const note_contents = await this.app.vault.cachedRead(curr_file);
    let processed_since_last_save = 0;
    const note_sections = this.block_parser(note_contents, curr_file.path);
    if (note_sections.length > 1) {
      for (let j = 0; j < note_sections.length; j++) {
        const block_embed_input = note_sections[j].text;
        const block_key = md5(note_sections[j].path);
        blocks.push(block_key);
        if (this.smart_vec_lite.get_size(block_key) === block_embed_input.length) {
          continue;
        }
        if (this.smart_vec_lite.mtime_is_current(block_key, curr_file.stat.mtime)) {
          continue;
        }
        const block_hash = md5(block_embed_input.trim());
        if (this.smart_vec_lite.get_hash(block_key) === block_hash) {
          continue;
        }
        req_batch.push([
          block_key,
          block_embed_input,
          {
            // oldmtime: curr_file.stat.mtime,
            // get current datetime as unix timestamp
            mtime: Date.now(),
            hash: block_hash,
            parent: curr_file_key,
            path: note_sections[j].path,
            size: block_embed_input.length
          }
        ]);
        if (req_batch.length > 9) {
          await this.get_embeddings_batch(req_batch);
          processed_since_last_save += req_batch.length;
          if (processed_since_last_save >= 30) {
            await this.save_embeddings_to_file();
            processed_since_last_save = 0;
          }
          req_batch = [];
        }
      }
    }
    if (req_batch.length > 0) {
      await this.get_embeddings_batch(req_batch);
      req_batch = [];
      processed_since_last_save += req_batch.length;
    }
    file_embed_input += `:
`;
    if (note_contents.length < MAX_EMBED_STRING_LENGTH) {
      file_embed_input += note_contents;
    } else {
      const note_meta_cache = this.app.metadataCache.getFileCache(curr_file);
      if (typeof note_meta_cache.headings === "undefined") {
        file_embed_input += note_contents.substring(0, MAX_EMBED_STRING_LENGTH);
      } else {
        let note_headings = "";
        for (let j = 0; j < note_meta_cache.headings.length; j++) {
          const heading_level = note_meta_cache.headings[j].level;
          const heading_text = note_meta_cache.headings[j].heading;
          let md_heading = "";
          for (let k = 0; k < heading_level; k++) {
            md_heading += "#";
          }
          note_headings += `${md_heading} ${heading_text}
`;
        }
        file_embed_input += note_headings;
        if (file_embed_input.length > MAX_EMBED_STRING_LENGTH) {
          file_embed_input = file_embed_input.substring(
            0,
            MAX_EMBED_STRING_LENGTH
          );
        }
      }
    }
    const file_hash = md5(file_embed_input.trim());
    const existing_hash = this.smart_vec_lite.get_hash(curr_file_key);
    if (existing_hash && file_hash === existing_hash) {
      this.update_render_log(blocks, file_embed_input);
      return;
    }
    const existing_blocks = this.smart_vec_lite.get_children(curr_file_key);
    let existing_has_all_blocks = true;
    if (existing_blocks && Array.isArray(existing_blocks) && blocks.length > 0) {
      for (let j = 0; j < blocks.length; j++) {
        if (existing_blocks.indexOf(blocks[j]) === -1) {
          existing_has_all_blocks = false;
          break;
        }
      }
    }
    if (existing_has_all_blocks) {
      const curr_file_size = curr_file.stat.size;
      const prev_file_size = this.smart_vec_lite.get_size(curr_file_key);
      if (prev_file_size) {
        const file_delta_pct = Math.round(
          Math.abs(curr_file_size - prev_file_size) / curr_file_size * 100
        );
        if (file_delta_pct < 10) {
          this.render_log.skipped_low_delta[curr_file.name] = file_delta_pct + "%";
          this.update_render_log(blocks, file_embed_input);
          return;
        }
      }
    }
    let meta = {
      mtime: curr_file.stat.mtime,
      hash: file_hash,
      path: curr_file.path,
      size: curr_file.stat.size,
      children: blocks
    };
    req_batch.push([curr_file_key, file_embed_input, meta]);
    await this.get_embeddings_batch(req_batch);
    if (save) {
      await this.save_embeddings_to_file();
    }
  }
  update_render_log(blocks, file_embed_input) {
    if (blocks.length > 0) {
      this.render_log.tokens_saved_by_cache += file_embed_input.length / 2;
    } else {
      this.render_log.tokens_saved_by_cache += file_embed_input.length / 4;
    }
  }
  async get_embeddings_batch(req_batch) {
    console.log("get_embeddings_batch");
    if (req_batch.length === 0)
      return;
    const embed_inputs = req_batch.map((req) => req[1]);
    const requestResults = await this.request_embedding_from_input(
      embed_inputs
    );
    if (!requestResults) {
      console.log("failed embedding batch");
      this.render_log.failed_embeddings = [
        ...this.render_log.failed_embeddings,
        ...req_batch.map((req) => req[2].path)
      ];
      return;
    }
    if (requestResults) {
      this.has_new_embeddings = true;
      if (this.settings.log_render) {
        if (this.settings.log_render_files) {
          this.render_log.files = [
            ...this.render_log.files,
            ...req_batch.map((req) => req[2].path)
          ];
        }
        this.render_log.new_embeddings += req_batch.length;
        this.render_log.token_usage += requestResults.usage.total_tokens;
      }
      for (let i = 0; i < requestResults.data.length; i++) {
        const vec = requestResults.data[i].embedding;
        const index = requestResults.data[i].index;
        if (vec) {
          const key = req_batch[index][0];
          const meta = req_batch[index][2];
          this.smart_vec_lite.save_embedding(key, vec, meta);
        }
      }
    }
  }
  async request_embedding_from_input(embed_input, retries = 0) {
    if (embed_input.length === 0) {
      console.log("embed_input is empty");
      return null;
    }
    const selectedProfile = this.settings.profiles[this.settings.selectedProfileIndex];
    let requestBodyObj = JSON.parse(selectedProfile.requestBody);
    let requestBodyStr = JSON.stringify(requestBodyObj);
    requestBodyStr = requestBodyStr.replace(
      /"{embed_input}"/g,
      JSON.stringify(embed_input)
    );
    requestBodyObj = JSON.parse(requestBodyStr);
    const reqParams = {
      url: selectedProfile.endpoint,
      method: "POST",
      body: JSON.stringify(requestBodyObj),
      // Convert back to JSON string after replacing input
      headers: JSON.parse(selectedProfile.headers)
      // Parse headers from JSON string
    };
    let resp;
    try {
      resp = await (0, Obsidian.request)(reqParams);
      let parsedResp = JSON.parse(resp);
      const embeddingVector = getEmbeddingVectorFromResponse(
        parsedResp,
        selectedProfile.responseJSON
      );
      const adjustedResponse = { data: [{ embedding: embeddingVector, index: 0 }] };
      return adjustedResponse;
    } catch (error) {
      if (error.status === 429 && retries < 3) {
        console.log("error status:", error.status);
        retries++;
        const backoff = Math.pow(retries, 2);
        console.log(`retrying request (429) in ${backoff} seconds...`);
        await new Promise((r) => setTimeout(r, 1e3 * backoff));
        return await this.request_embedding_from_input(embed_input, retries);
      }
      return null;
    }
    function getEmbeddingVectorFromResponse(responseJson, responseFormat) {
      let formatObj = JSON.parse(responseFormat);
      let pathToEmbedding = findPathToEmbedding(formatObj, "{embed_output}");
      let embeddingVector = getValueAtPath(responseJson, pathToEmbedding);
      return embeddingVector;
    }
    function findPathToEmbedding(obj, placeholder, path = "") {
      if (typeof obj === "object") {
        for (let key in obj) {
          if (obj[key] === placeholder) {
            return path + (path ? "." : "") + key;
          } else if (typeof obj[key] === "object") {
            let result = findPathToEmbedding(
              obj[key],
              placeholder,
              path + (path ? "." : "") + key
            );
            if (result) {
              return result;
            }
          }
        }
      }
      return null;
    }
    function getValueAtPath(obj, path) {
      let parts = path.split(".");
      let current = obj;
      for (let part of parts) {
        if (current[part] === void 0) {
          return void 0;
        }
        current = current[part];
      }
      return current;
    }
  }
  output_render_log() {
    if (this.settings.log_render) {
      if (this.render_log.new_embeddings === 0) {
        return;
      } else {
        console.log(JSON.stringify(this.render_log, null, 2));
      }
    }
    this.render_log = {};
    this.render_log.deleted_embeddings = 0;
    this.render_log.exclusions_logs = {};
    this.render_log.failed_embeddings = [];
    this.render_log.files = [];
    this.render_log.new_embeddings = 0;
    this.render_log.skipped_low_delta = {};
    this.render_log.token_usage = 0;
    this.render_log.tokens_saved_by_cache = 0;
  }
  // find connections by most similar to current note by cosine similarity
  async find_note_connections(current_note = null) {
    const curr_key = md5(current_note.path);
    let nearest = [];
    if (this.nearest_cache[curr_key]) {
      nearest = this.nearest_cache[curr_key];
    } else {
      for (let j = 0; j < this.file_exclusions.length; j++) {
        if (current_note.path.indexOf(this.file_exclusions[j]) > -1) {
          this.log_exclusion(this.file_exclusions[j]);
          return "excluded";
        }
      }
      setTimeout(() => {
        this.get_all_embeddings();
      }, 3e3);
      if (this.smart_vec_lite.mtime_is_current(curr_key, current_note.stat.mtime)) {
      } else {
        await this.get_file_embeddings(current_note);
      }
      const vec = this.smart_vec_lite.get_vec(curr_key);
      if (!vec) {
        return "Error getting embeddings for: " + current_note.path;
      }
      nearest = this.smart_vec_lite.nearest(vec, {
        skip_key: curr_key,
        skip_sections: this.settings.skip_sections
      });
      this.nearest_cache[curr_key] = nearest;
    }
    return nearest;
  }
  // create render_log object of exlusions with number of times skipped as value
  log_exclusion(exclusion) {
    this.render_log.exclusions_logs[exclusion] = (this.render_log.exclusions_logs[exclusion] || 0) + 1;
  }
  block_parser(markdown, file_path) {
    if (this.settings.skip_sections) {
      return [];
    }
    const lines = markdown.split("\n");
    let blocks = [];
    let currentHeaders = [];
    const file_breadcrumbs = file_path.replace(".md", "").replace(/\//g, " > ");
    let block = "";
    let block_headings = "";
    let block_path = file_path;
    let last_heading_line = 0;
    let i = 0;
    let block_headings_list = [];
    for (i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("#") || ["#", " "].indexOf(line[1]) < 0) {
        if (line === "")
          continue;
        if (["- ", "- [ ] "].indexOf(line) > -1)
          continue;
        if (currentHeaders.length === 0)
          continue;
        block += "\n" + line;
        continue;
      }
      last_heading_line = i;
      if (i > 0 && last_heading_line !== i - 1 && block.indexOf("\n") > -1 && this.validate_headings(block_headings)) {
        output_block();
      }
      const level = line.split("#").length - 1;
      currentHeaders = currentHeaders.filter((header) => header.level < level);
      currentHeaders.push({
        header: line.replace(/#/g, "").trim(),
        level
      });
      block = file_breadcrumbs;
      block += ": " + currentHeaders.map((header) => header.header).join(" > ");
      block_headings = "#" + currentHeaders.map((header) => header.header).join("#");
      if (block_headings_list.indexOf(block_headings) > -1) {
        let count = 1;
        while (block_headings_list.indexOf(`${block_headings}{${count}}`) > -1) {
          count++;
        }
        block_headings = `${block_headings}{${count}}`;
      }
      block_headings_list.push(block_headings);
      block_path = file_path + block_headings;
    }
    if (last_heading_line !== i - 1 && block.indexOf("\n") > -1 && this.validate_headings(block_headings))
      output_block();
    blocks = blocks.filter((b) => b.length > 50);
    return blocks;
    function output_block() {
      const breadcrumbs_length = block.indexOf("\n") + 1;
      const block_length = block.length - breadcrumbs_length;
      if (block.length > MAX_EMBED_STRING_LENGTH) {
        block = block.substring(0, MAX_EMBED_STRING_LENGTH);
      }
      blocks.push({
        text: block.trim(),
        path: block_path,
        length: block_length
      });
    }
  }
  // reverse-retrieve block given path
  async block_retriever(path, limits = {}) {
    limits = {
      lines: null,
      chars_per_line: null,
      max_chars: null,
      ...limits
    };
    if (path.indexOf("#") < 0) {
      console.log("not a block path: " + path);
      return false;
    }
    let block = [];
    let block_headings = path.split("#").slice(1);
    let heading_occurrence = 0;
    if (block_headings[block_headings.length - 1].indexOf("{") > -1) {
      heading_occurrence = parseInt(
        block_headings[block_headings.length - 1].split("{")[1].replace("}", "")
      );
      block_headings[block_headings.length - 1] = block_headings[block_headings.length - 1].split("{")[0];
    }
    let currentHeaders = [];
    let occurrence_count = 0;
    let begin_line = 0;
    let i = 0;
    const file_path = path.split("#")[0];
    const file = this.app.vault.getAbstractFileByPath(file_path);
    if (!(file instanceof Obsidian.TFile)) {
      console.log("not a file: " + file_path);
      return false;
    }
    const file_contents = await this.app.vault.cachedRead(file);
    const lines = file_contents.split("\n");
    let is_code = false;
    for (i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.indexOf("```") === 0) {
        is_code = !is_code;
      }
      if (is_code) {
        continue;
      }
      if (["- ", "- [ ] "].indexOf(line) > -1)
        continue;
      if (!line.startsWith("#") || ["#", " "].indexOf(line[1]) < 0) {
        continue;
      }
      const heading_text = line.replace(/#/g, "").trim();
      const heading_index = block_headings.indexOf(heading_text);
      if (heading_index < 0)
        continue;
      if (currentHeaders.length !== heading_index)
        continue;
      currentHeaders.push(heading_text);
      if (currentHeaders.length === block_headings.length) {
        if (heading_occurrence === 0) {
          begin_line = i + 1;
          break;
        }
        if (occurrence_count === heading_occurrence) {
          begin_line = i + 1;
          break;
        }
        occurrence_count++;
        currentHeaders.pop();
        continue;
      }
    }
    if (begin_line === 0)
      return false;
    is_code = false;
    let char_count = 0;
    for (i = begin_line; i < lines.length; i++) {
      if (typeof line_limit === "number" && block.length > line_limit) {
        block.push("...");
        break;
      }
      let line = lines[i];
      if (line.indexOf("#") === 0 && ["#", " "].indexOf(line[1]) !== -1) {
        break;
      }
      if (limits.max_chars && char_count > limits.max_chars) {
        block.push("...");
        break;
      }
      if (limits.max_chars && line.length + char_count > limits.max_chars) {
        const max_new_chars = limits.max_chars - char_count;
        line = line.slice(0, max_new_chars) + "...";
        break;
      }
      if (line.length === 0)
        continue;
      if (limits.chars_per_line && line.length > limits.chars_per_line) {
        line = line.slice(0, limits.chars_per_line) + "...";
      }
      if (line.startsWith("```")) {
        is_code = !is_code;
        continue;
      }
      if (is_code) {
        line = "	" + line;
      }
      block.push(line);
      char_count += line.length;
    }
    if (is_code) {
      block.push("```");
    }
    return block.join("\n").trim();
  }
  // retrieve a file from the vault
  async file_retriever(link, limits = {}) {
    limits = {
      lines: null,
      max_chars: null,
      chars_per_line: null,
      ...limits
    };
    const this_file = this.app.vault.getAbstractFileByPath(link);
    if (!(this_file instanceof Obsidian.TAbstractFile))
      return false;
    const file_content = await this.app.vault.cachedRead(this_file);
    const file_lines = file_content.split("\n");
    let first_ten_lines = [];
    let is_code = false;
    let char_accum = 0;
    const line_limit2 = limits.lines || file_lines.length;
    for (let i = 0; first_ten_lines.length < line_limit2; i++) {
      let line = file_lines[i];
      if (typeof line === "undefined")
        break;
      if (line.length === 0)
        continue;
      if (limits.chars_per_line && line.length > limits.chars_per_line) {
        line = line.slice(0, limits.chars_per_line) + "...";
      }
      if (line === "---")
        continue;
      if (["- ", "- [ ] "].indexOf(line) > -1)
        continue;
      if (line.indexOf("```") === 0) {
        is_code = !is_code;
        continue;
      }
      if (limits.max_chars && char_accum > limits.max_chars) {
        first_ten_lines.push("...");
        break;
      }
      if (is_code) {
        line = "	" + line;
      }
      if (line_is_heading(line)) {
        if (first_ten_lines.length > 0 && line_is_heading(first_ten_lines[first_ten_lines.length - 1])) {
          first_ten_lines.pop();
        }
      }
      first_ten_lines.push(line);
      char_accum += line.length;
    }
    for (let i = 0; i < first_ten_lines.length; i++) {
      if (line_is_heading(first_ten_lines[i])) {
        if (i === first_ten_lines.length - 1) {
          first_ten_lines.pop();
          break;
        }
        first_ten_lines[i] = first_ten_lines[i].replace(/#+/, "");
        first_ten_lines[i] = `
${first_ten_lines[i]}:`;
      }
    }
    first_ten_lines = first_ten_lines.join("\n");
    return first_ten_lines;
  }
  // iterate through blocks and skip if block_headings contains this.header_exclusions
  validate_headings(block_headings) {
    let valid = true;
    if (this.header_exclusions.length > 0) {
      for (let k = 0; k < this.header_exclusions.length; k++) {
        if (block_headings.indexOf(this.header_exclusions[k]) > -1) {
          valid = false;
          this.log_exclusion("heading: " + this.header_exclusions[k]);
          break;
        }
      }
    }
    return valid;
  }
  // render "Smart Connections" text fixed in the bottom right corner
  render_brand(container, location = "default") {
    if (container === "all") {
      const locations = Object.keys(this.sc_branding);
      for (let i = 0; i < locations.length; i++) {
        this.render_brand(this.sc_branding[locations[i]], locations[i]);
      }
      return;
    }
    this.sc_branding[location] = container;
    if (this.sc_branding[location].querySelector(".sc-brand")) {
      this.sc_branding[location].querySelector(".sc-brand").remove();
    }
    const brand_container = this.sc_branding[location].createEl("div", {
      cls: "sc-brand"
    });
    Obsidian.setIcon(brand_container, "smart-connections");
    const brand_p = brand_container.createEl("p");
    let text = "Smart Connections";
    let attr = {};
    if (this.update_available) {
      text = "Update Available";
      attr = {
        style: "font-weight: 700;"
      };
    }
    brand_p.createEl("a", {
      cls: "",
      text,
      href: "https://github.com/brianpetro/obsidian-smart-connections/discussions",
      target: "_blank",
      attr
    });
  }
  // create list of nearest notes
  async update_results(container, nearest) {
    let list;
    if (container.children.length > 1 && container.children[1].classList.contains("sc-list")) {
      list = container.children[1];
    }
    if (list) {
      list.empty();
    } else {
      list = container.createEl("div", { cls: "sc-list" });
    }
    let search_result_class = "search-result";
    if (!this.settings.expanded_view)
      search_result_class += " sc-collapsed";
    if (!this.settings.group_nearest_by_file) {
      for (let i = 0; i < nearest.length; i++) {
        if (typeof nearest[i].link === "object") {
          const item2 = list.createEl("div", { cls: "search-result" });
          const link2 = item2.createEl("a", {
            cls: "search-result-file-title is-clickable",
            href: nearest[i].link.path,
            title: nearest[i].link.title
          });
          link2.innerHTML = this.render_external_link_elm(nearest[i].link);
          item2.setAttr("draggable", "true");
          continue;
        }
        let file_link_text;
        const file_similarity_pct = Math.round(nearest[i].similarity * 100) + "%";
        if (this.settings.show_full_path) {
          const pcs = nearest[i].link.split("/");
          file_link_text = pcs[pcs.length - 1];
          const path = pcs.slice(0, pcs.length - 1).join("/");
          file_link_text = `<small>${file_similarity_pct} | ${path} | ${file_link_text}</small>`;
        } else {
          file_link_text = "<small>" + file_similarity_pct + " | " + nearest[i].link.split("/").pop() + "</small>";
        }
        if (!this.renderable_file_type(nearest[i].link)) {
          const item2 = list.createEl("div", { cls: "search-result" });
          const link2 = item2.createEl("a", {
            cls: "search-result-file-title is-clickable",
            href: nearest[i].link
          });
          link2.innerHTML = file_link_text;
          item2.setAttr("draggable", "true");
          this.add_link_listeners(link2, nearest[i], item2);
          continue;
        }
        file_link_text = file_link_text.replace(".md", "").replace(/#/g, " > ");
        const item = list.createEl("div", { cls: search_result_class });
        const toggle = item.createEl("span", { cls: "is-clickable" });
        Obsidian.setIcon(toggle, "right-triangle");
        const link = toggle.createEl("a", {
          cls: "search-result-file-title",
          title: nearest[i].link
        });
        link.innerHTML = file_link_text;
        this.add_link_listeners(link, nearest[i], item);
        toggle.addEventListener("click", (event) => {
          let parent = event.target.parentElement;
          while (!parent.classList.contains("search-result")) {
            parent = parent.parentElement;
          }
          parent.classList.toggle("sc-collapsed");
        });
        const contents = item.createEl("ul", { cls: "" });
        const contents_container = contents.createEl("li", {
          cls: "search-result-file-title is-clickable",
          title: nearest[i].link
        });
        if (nearest[i].link.indexOf("#") > -1) {
          Obsidian.MarkdownRenderer.renderMarkdown(
            await this.block_retriever(nearest[i].link, {
              lines: 10,
              max_chars: 1e3
            }),
            contents_container,
            nearest[i].link,
            new Obsidian.Component()
          );
        } else {
          const first_ten_lines = await this.file_retriever(nearest[i].link, {
            lines: 10,
            max_chars: 1e3
          });
          if (!first_ten_lines)
            continue;
          Obsidian.MarkdownRenderer.renderMarkdown(
            first_ten_lines,
            contents_container,
            nearest[i].link,
            new Obsidian.Component()
          );
        }
        this.add_link_listeners(contents, nearest[i], item);
      }
      this.render_brand(container, "block");
      return;
    }
    const nearest_by_file = {};
    for (let i = 0; i < nearest.length; i++) {
      const curr = nearest[i];
      const link = curr.link;
      if (typeof link === "object") {
        nearest_by_file[link.path] = [curr];
        continue;
      }
      if (link.indexOf("#") > -1) {
        const file_path = link.split("#")[0];
        if (!nearest_by_file[file_path]) {
          nearest_by_file[file_path] = [];
        }
        nearest_by_file[file_path].push(nearest[i]);
      } else {
        if (!nearest_by_file[link]) {
          nearest_by_file[link] = [];
        }
        nearest_by_file[link].unshift(nearest[i]);
      }
    }
    const keys = Object.keys(nearest_by_file);
    for (let i = 0; i < keys.length; i++) {
      const file = nearest_by_file[keys[i]];
      if (typeof file[0].link === "object") {
        const curr = file[0];
        const meta = curr.link;
        if (meta.path.startsWith("http")) {
          const item2 = list.createEl("div", { cls: "search-result" });
          const link = item2.createEl("a", {
            cls: "search-result-file-title is-clickable",
            href: meta.path,
            title: meta.title
          });
          link.innerHTML = this.render_external_link_elm(meta);
          item2.setAttr("draggable", "true");
          continue;
        }
      }
      let file_link_text;
      const file_similarity_pct = Math.round(file[0].similarity * 100) + "%";
      if (this.settings.show_full_path) {
        const pcs = file[0].link.split("/");
        file_link_text = pcs[pcs.length - 1];
        const path = pcs.slice(0, pcs.length - 1).join("/");
        file_link_text = `<small>${path} | ${file_similarity_pct}</small><br>${file_link_text}`;
      } else {
        file_link_text = file[0].link.split("/").pop();
        file_link_text += " | " + file_similarity_pct;
      }
      if (!this.renderable_file_type(file[0].link)) {
        const item2 = list.createEl("div", { cls: "search-result" });
        const file_link2 = item2.createEl("a", {
          cls: "search-result-file-title is-clickable",
          title: file[0].link
        });
        file_link2.innerHTML = file_link_text;
        this.add_link_listeners(file_link2, file[0], item2);
        continue;
      }
      file_link_text = file_link_text.replace(".md", "").replace(/#/g, " > ");
      const item = list.createEl("div", { cls: search_result_class });
      const toggle = item.createEl("span", { cls: "is-clickable" });
      Obsidian.setIcon(toggle, "right-triangle");
      const file_link = toggle.createEl("a", {
        cls: "search-result-file-title",
        title: file[0].link
      });
      file_link.innerHTML = file_link_text;
      this.add_link_listeners(file_link, file[0], toggle);
      toggle.addEventListener("click", (event) => {
        let parent = event.target;
        while (!parent.classList.contains("search-result")) {
          parent = parent.parentElement;
        }
        parent.classList.toggle("sc-collapsed");
      });
      const file_link_list = item.createEl("ul");
      for (let j = 0; j < file.length; j++) {
        if (file[j].link.indexOf("#") > -1) {
          const block = file[j];
          const block_link = file_link_list.createEl("li", {
            cls: "search-result-file-title is-clickable",
            title: block.link
          });
          if (file.length > 1) {
            const block_context = this.render_block_context(block);
            const block_similarity_pct = Math.round(block.similarity * 100) + "%";
            block_link.innerHTML = `<small>${block_context} | ${block_similarity_pct}</small>`;
          }
          const block_container = block_link.createEl("div");
          Obsidian.MarkdownRenderer.renderMarkdown(
            await this.block_retriever(block.link, {
              lines: 10,
              max_chars: 1e3
            }),
            block_container,
            block.link,
            new Obsidian.Component()
          );
          this.add_link_listeners(block_link, block, file_link_list);
        } else {
          const file_link_list2 = item.createEl("ul");
          const block_link = file_link_list2.createEl("li", {
            cls: "search-result-file-title is-clickable",
            title: file[0].link
          });
          const block_container = block_link.createEl("div");
          let first_ten_lines = await this.file_retriever(file[0].link, {
            lines: 10,
            max_chars: 1e3
          });
          if (!first_ten_lines)
            continue;
          Obsidian.MarkdownRenderer.renderMarkdown(
            first_ten_lines,
            block_container,
            file[0].link,
            new Obsidian.Component()
          );
          this.add_link_listeners(block_link, file[0], file_link_list2);
        }
      }
    }
    this.render_brand(container, "file");
  }
  add_link_listeners(item, curr, list) {
    item.addEventListener("click", async (event) => {
      await this.open_note(curr, event);
    });
    item.setAttr("draggable", "true");
    item.addEventListener("dragstart", (event) => {
      const dragManager = this.app.dragManager;
      const file_path = curr.link.split("#")[0];
      const file = this.app.metadataCache.getFirstLinkpathDest(file_path, "");
      const dragData = dragManager.dragFile(event, file);
      dragManager.onDragStart(event, dragData);
    });
    if (curr.link.indexOf("{") > -1)
      return;
    item.addEventListener("mouseover", (event) => {
      this.app.workspace.trigger("hover-link", {
        event,
        source: SMART_CONNECTIONS_VIEW_TYPE,
        hoverParent: list,
        targetEl: item,
        linktext: curr.link
      });
    });
  }
  // get target file from link path
  // if sub-section is linked, open file and scroll to sub-section
  async open_note(curr, event = null) {
    let targetFile;
    let heading;
    if (curr.link.indexOf("#") > -1) {
      targetFile = this.app.metadataCache.getFirstLinkpathDest(
        curr.link.split("#")[0],
        ""
      );
      const target_file_cache = this.app.metadataCache.getFileCache(targetFile);
      let heading_text = curr.link.split("#").pop();
      let occurence = 0;
      if (heading_text.indexOf("{") > -1) {
        occurence = parseInt(heading_text.split("{")[1].split("}")[0]);
        heading_text = heading_text.split("{")[0];
      }
      const headings = target_file_cache.headings;
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].heading === heading_text) {
          if (occurence === 0) {
            heading = headings[i];
            break;
          }
          occurence--;
        }
      }
    } else {
      targetFile = this.app.metadataCache.getFirstLinkpathDest(curr.link, "");
    }
    let leaf;
    if (event) {
      const mod = Obsidian.Keymap.isModEvent(event);
      leaf = this.app.workspace.getLeaf(mod);
    } else {
      leaf = this.app.workspace.getMostRecentLeaf();
    }
    await leaf.openFile(targetFile);
    if (heading) {
      let { editor } = leaf.view;
      const pos = { line: heading.position.start.line, ch: 0 };
      editor.setCursor(pos);
      editor.scrollIntoView({ to: pos, from: pos }, true);
    }
  }
  render_block_context(block) {
    const block_headings = block.link.split(".md")[1].split("#");
    let block_context = "";
    for (let i = block_headings.length - 1; i >= 0; i--) {
      if (block_context.length > 0) {
        block_context = ` > ${block_context}`;
      }
      block_context = block_headings[i] + block_context;
      if (block_context.length > 100) {
        break;
      }
    }
    if (block_context.startsWith(" > ")) {
      block_context = block_context.slice(3);
    }
    return block_context;
  }
  renderable_file_type(link) {
    return link.indexOf(".md") !== -1 && link.indexOf(".excalidraw") === -1;
  }
  render_external_link_elm(meta) {
    if (meta.source) {
      if (meta.source === "Gmail")
        meta.source = "\u{1F4E7} Gmail";
      return `<small>${meta.source}</small><br>${meta.title}`;
    }
    let domain = meta.path.replace(/(^\w+:|^)\/\//, "");
    domain = domain.split("/")[0];
    return `<small>\u{1F310} ${domain}</small><br>${meta.title}`;
  }
  // get all folders
  async get_all_folders() {
    if (!this.folders || this.folders.length === 0) {
      this.folders = await this.get_folders();
    }
    return this.folders;
  }
  // get folders, traverse non-hidden sub-folders
  async get_folders(path = "/") {
    let folders = (await this.app.vault.adapter.list(path)).folders;
    let folder_list = [];
    for (let i = 0; i < folders.length; i++) {
      if (folders[i].startsWith("."))
        continue;
      folder_list.push(folders[i]);
      folder_list = folder_list.concat(
        await this.get_folders(folders[i] + "/")
      );
    }
    return folder_list;
  }
  async build_notes_object(files) {
    let output = {};
    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      let parts = file.path.split("/");
      let current = output;
      for (let ii = 0; ii < parts.length; ii++) {
        let part = parts[ii];
        if (ii === parts.length - 1) {
          current[part] = await this.app.vault.cachedRead(file);
        } else {
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
      }
    }
    return output;
  }
  async initializeProfiles() {
    if (!this.settings.profiles || this.settings.profiles.length === 0) {
      this.settings.profiles = [
        {
          name: "OpenAI Default",
          endpoint: "https://api.openai.com/v1/embeddings",
          headers: JSON.stringify(
            {
              "Content-Type": "application/json",
              Authorization: "Bearer sk-?"
            },
            null,
            2
          ),
          requestBody: JSON.stringify(
            {
              model: "text-embedding-ada-002",
              input: "{embed_input}"
            },
            null,
            2
          ),
          responseJSON: JSON.stringify(
            {
              data: [
                { embedding: "{embed_output}", index: 0, object: "embedding" }
              ],
              model: "text-embedding-ada-002-v2",
              object: "list",
              usage: { prompt_tokens: 12, total_tokens: 12 }
            },
            null,
            2
          )
        }
      ];
      this.settings.selectedProfileIndex = 0;
      await this.saveSettings();
    }
  }
};
var SMART_CONNECTIONS_VIEW_TYPE = "smart-connections-view";
var SmartConnectionsView = class extends Obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.nearest = null;
    this.load_wait = null;
  }
  getViewType() {
    return SMART_CONNECTIONS_VIEW_TYPE;
  }
  getDisplayText() {
    return "Smart Connections Files";
  }
  getIcon() {
    return "smart-connections";
  }
  set_message(message) {
    const container = this.containerEl.children[1];
    container.empty();
    this.initiate_top_bar(container);
    if (Array.isArray(message)) {
      for (let i = 0; i < message.length; i++) {
        container.createEl("p", { cls: "sc_message", text: message[i] });
      }
    } else {
      container.createEl("p", { cls: "sc_message", text: message });
    }
  }
  render_link_text(link, show_full_path = false) {
    if (!show_full_path) {
      link = link.split("/").pop();
    }
    if (link.indexOf("#") > -1) {
      link = link.split(".md");
      link[0] = `<small>${link[0]}</small><br>`;
      link = link.join("");
      link = link.replace(/\#/g, " \xBB ");
    } else {
      link = link.replace(".md", "");
    }
    return link;
  }
  set_nearest(nearest, nearest_context = null, results_only = false) {
    const container = this.containerEl.children[1];
    if (!results_only) {
      container.empty();
      this.initiate_top_bar(container, nearest_context);
    }
    this.plugin.update_results(container, nearest);
  }
  initiate_top_bar(container, nearest_context = null) {
    let top_bar;
    if (container.children.length > 0 && container.children[0].classList.contains("sc-top-bar")) {
      top_bar = container.children[0];
      top_bar.empty();
    } else {
      top_bar = container.createEl("div", { cls: "sc-top-bar" });
    }
    if (nearest_context) {
      top_bar.createEl("p", { cls: "sc-context", text: nearest_context });
    }
    const chat_button = top_bar.createEl("button", { cls: "sc-chat-button" });
    Obsidian.setIcon(chat_button, "message-square");
    chat_button.addEventListener("click", () => {
      this.plugin.open_chat();
    });
    const search_button = top_bar.createEl("button", {
      cls: "sc-search-button"
    });
    Obsidian.setIcon(search_button, "search");
    search_button.addEventListener("click", () => {
      top_bar.empty();
      const search_container = top_bar.createEl("div", {
        cls: "search-input-container"
      });
      const input = search_container.createEl("input", {
        cls: "sc-search-input",
        type: "search",
        placeholder: "Type to start search..."
      });
      input.focus();
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          this.clear_auto_searcher();
          this.initiate_top_bar(container, nearest_context);
        }
      });
      input.addEventListener("keyup", (event) => {
        this.clear_auto_searcher();
        const search_term = input.value;
        if (event.key === "Enter" && search_term !== "") {
          this.search(search_term);
        } else if (search_term !== "") {
          clearTimeout(this.search_timeout);
          this.search_timeout = setTimeout(() => {
            this.search(search_term, true);
          }, 700);
        }
      });
    });
  }
  // render buttons: "create" and "retry" for loading embeddings.json file
  render_embeddings_buttons() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h2", {
      cls: "scHeading",
      text: "Embeddings file not found"
    });
    const button_div = container.createEl("div", { cls: "scButtonDiv" });
    const create_button = button_div.createEl("button", {
      cls: "scButton",
      text: "Create embeddings.json"
    });
    button_div.createEl("p", {
      cls: "scButtonNote",
      text: "Warning: Creating embeddings.json file will trigger bulk embedding and may take a while"
    });
    const retry_button = button_div.createEl("button", {
      cls: "scButton",
      text: "Retry"
    });
    button_div.createEl("p", {
      cls: "scButtonNote",
      text: "If embeddings.json file already exists, click 'Retry' to load it"
    });
    create_button.addEventListener("click", async () => {
      const profileSpecificFileName = `embeddings-${this.selectedProfile.name}.json`;
      await this.plugin.smart_vec_lite.init_embeddings_file(profileSpecificFileName);
      await this.render_connections();
    });
    retry_button.addEventListener("click", async () => {
      console.log("retrying to load embeddings.json file");
      const profileSpecificFileName = `embeddings-${this.selectedProfile.name}.json`;
      await this.plugin.init_vecs(profileSpecificFileName);
      await this.render_connections();
    });
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("p", {
      cls: "scPlaceholder",
      text: "Open a note to find connections."
    });
    this.plugin.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file) {
          return;
        }
        if (SUPPORTED_FILE_TYPES.indexOf(file.extension) === -1) {
          return this.set_message([
            "File: " + file.name,
            "Unsupported file type (Supported: " + SUPPORTED_FILE_TYPES.join(", ") + ")"
          ]);
        }
        if (this.load_wait) {
          clearTimeout(this.load_wait);
        }
        this.load_wait = setTimeout(() => {
          this.render_connections(file);
          this.load_wait = null;
        }, 1e3);
      })
    );
    this.app.workspace.registerHoverLinkSource(SMART_CONNECTIONS_VIEW_TYPE, {
      display: "Smart Connections Files",
      defaultMod: true
    });
    this.app.workspace.registerHoverLinkSource(
      SMART_CONNECTIONS_CHAT_VIEW_TYPE,
      {
        display: "Smart Chat Links",
        defaultMod: true
      }
    );
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
  }
  async initialize() {
    this.set_message("Loading embeddings file...");
    const profileSpecificFileName = `embeddings-${this.plugin.settings.profiles[this.plugin.settings.selectedProfileIndex].name}.json`;
    const vecs_intiated = await this.plugin.init_vecs(profileSpecificFileName);
    if (vecs_intiated) {
      this.set_message("Embeddings file loaded.");
      await this.render_connections();
    } else {
      this.render_embeddings_buttons();
    }
    this.api = new SmartConnectionsViewApi(this.app, this.plugin, this);
    (window["SmartConnectionsViewApi"] = this.api) && this.register(() => delete window["SmartConnectionsViewApi"]);
  }
  async onClose() {
    console.log("closing smart connections view");
    this.app.workspace.unregisterHoverLinkSource(SMART_CONNECTIONS_VIEW_TYPE);
    this.plugin.view = null;
  }
  async render_connections(context = null) {
    console.log("rendering connections");
    if (!this.plugin.embeddings_loaded) {
      const profileSpecificFileName = `embeddings-${this.selectedProfile.name}.json`;
      await this.plugin.init_vecs(profileSpecificFileName);
    }
    if (!this.plugin.embeddings_loaded) {
      console.log("embeddings files still not loaded or yet to be created");
      this.render_embeddings_buttons();
      return;
    }
    this.set_message("Making Smart Connections...");
    if (typeof context === "string") {
      const highlighted_text = context;
      await this.search(highlighted_text);
      return;
    }
    this.nearest = null;
    this.interval_count = 0;
    this.rendering = false;
    this.file = context;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.interval = setInterval(() => {
      if (!this.rendering) {
        if (this.file instanceof Obsidian.TFile) {
          this.rendering = true;
          this.render_note_connections(this.file);
        } else {
          this.file = this.app.workspace.getActiveFile();
          if (!this.file && this.count > 1) {
            clearInterval(this.interval);
            this.set_message("No active file");
            return;
          }
        }
      } else {
        if (this.nearest) {
          clearInterval(this.interval);
          if (typeof this.nearest === "string") {
            this.set_message(this.nearest);
          } else {
            this.set_nearest(this.nearest, "File: " + this.file.name);
          }
          if (this.plugin.render_log.failed_embeddings.length > 0) {
            this.plugin.save_failed_embeddings();
          }
          this.plugin.output_render_log();
          return;
        } else {
          this.interval_count++;
          this.set_message("Making Smart Connections..." + this.interval_count);
        }
      }
    }, 10);
  }
  async render_note_connections(file) {
    this.nearest = await this.plugin.find_note_connections(file);
  }
  clear_auto_searcher() {
    if (this.search_timeout) {
      clearTimeout(this.search_timeout);
      this.search_timeout = null;
    }
  }
  async search(search_text, results_only = false) {
    const nearest = await this.plugin.api.search(search_text);
    const nearest_context = `Selection: "${search_text.length > 100 ? search_text.substring(0, 100) + "..." : search_text}"`;
    this.set_nearest(nearest, nearest_context, results_only);
  }
};
var SmartConnectionsViewApi = class {
  constructor(app, plugin, view) {
    this.app = app;
    this.plugin = plugin;
    this.view = view;
  }
  async search(search_text) {
    return await this.plugin.api.search(search_text);
  }
  // trigger reload of embeddings file
  async reload_embeddings_file() {
    const profileSpecificFileName = `embeddings-${this.selectedProfile.name}.json`;
    await this.plugin.init_vecs(profileSpecificFileName);
    await this.view.render_connections();
  }
};
var ScSearchApi = class {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }
  async search(search_text, filter = {}) {
    filter = {
      skip_sections: this.plugin.settings.skip_sections,
      ...filter
    };
    let nearest = [];
    const resp = await this.plugin.request_embedding_from_input(search_text);
    if (resp && resp.data && resp.data[0] && resp.data[0].embedding) {
      nearest = this.plugin.smart_vec_lite.nearest(
        resp.data[0].embedding,
        filter
      );
    } else {
      new Obsidian.Notice("Smart Connections: Error getting embedding");
    }
    return nearest;
  }
};
var SmartConnectionsSettingsTab = class extends Obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.profileDropdown = null;
    this.profileName = null;
    this.endpointField = null;
    this.headersField = null;
    this.reqBodyField = null;
    this.jsonPathField = null;
    this.selectedIndex = null;
    this.selectedProfile = null;
  }
  display() {
    const containerEl = this.containerEl;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Embeddings API" });
    this.profileDropdown = new Obsidian.Setting(containerEl).setName("Select Profile").setDesc("Select an API profile").addDropdown((dropdown) => {
      this.plugin.settings.profiles.forEach((profile, index) => {
        dropdown.addOption(index.toString(), profile.name);
      });
      dropdown.onChange(async (value) => {
        const selectedIndex = parseInt(value);
        this.plugin.settings.selectedProfileIndex = selectedIndex;
        this.selectedIndex = selectedIndex;
        await applyProfile();
      });
    });
    this.profileName = new Obsidian.Setting(containerEl).setName("Profile Name").addText(
      (text) => text
      // text.onChange((value) => {
      //   /* handle change */
      // })
    );
    this.endpointField = new Obsidian.Setting(containerEl).setName("API Endpoint").addText(
      (text) => text
      // text.onChange((value) => {
      //   /* handle change */
      // })
    );
    this.headersField = new Obsidian.Setting(containerEl).setName("Custom Headers").addTextArea(
      (textArea) => textArea.onChange((value) => {
      })
    );
    this.reqBodyField = new Obsidian.Setting(containerEl).setName("Request Body").addTextArea(
      (textArea) => textArea.onChange((value) => {
      })
    );
    this.jsonPathField = new Obsidian.Setting(containerEl).setName("Response JSON").addTextArea(
      (textArea) => textArea.onChange((value) => {
      })
    );
    const applyProfile = async () => {
      if (this.selectedIndex >= 0) {
        this.selectedProfile = this.plugin.settings.profiles[this.selectedIndex];
        this.profileName.components[0].inputEl.value = this.selectedProfile.name;
        this.endpointField.components[0].inputEl.value = this.selectedProfile.endpoint;
        this.headersField.components[0].inputEl.value = this.selectedProfile.headers;
        this.reqBodyField.components[0].inputEl.value = this.selectedProfile.requestBody;
        this.jsonPathField.components[0].inputEl.value = this.selectedProfile.responseJSON;
        const profileSpecificFileName = `embeddings-${this.selectedProfile.name}.json`;
        await this.plugin.saveSettings();
        await this.plugin.init_vecs(profileSpecificFileName);
      }
    };
    const buttonContainer = new Obsidian.Setting(
      containerEl
    ).settingEl.createDiv("button-container");
    const saveButton = buttonContainer.createEl("button", {
      text: "Save Profile"
    });
    saveButton.addEventListener("click", async () => {
      const profileName = this.profileName.components[0].inputEl.value;
      const endpoint = this.endpointField.components[0].inputEl.value;
      const headers = this.headersField.components[0].inputEl.value;
      const requestBody = this.reqBodyField.components[0].inputEl.value;
      const responseJSON = this.jsonPathField.components[0].inputEl.value;
      const existingIndex = this.plugin.settings.profiles.findIndex(
        (p) => p.name === profileName
      );
      if (existingIndex >= 0) {
        this.plugin.settings.profiles[existingIndex] = {
          name: profileName,
          endpoint,
          headers,
          requestBody,
          responseJSON
        };
      } else {
        this.plugin.settings.profiles.push({
          name: profileName,
          endpoint,
          headers,
          requestBody,
          responseJSON
        });
      }
      await this.plugin.saveSettings();
      const selectElement = this.profileDropdown.components[0].selectEl;
      selectElement.innerHTML = "";
      this.plugin.settings.profiles.forEach((profile, index) => {
        const option = document.createElement("option");
        option.value = index.toString();
        option.textContent = profile.name;
        selectElement.appendChild(option);
      });
      if (existingIndex >= 0) {
        this.plugin.settings.selectedProfileIndex = existingIndex;
      } else {
        this.plugin.settings.selectedProfileIndex = this.plugin.settings.profiles.length - 1;
      }
      selectElement.value = this.plugin.settings.selectedProfileIndex.toString();
    });
    const deleteButton = buttonContainer.createEl("button", {
      text: "Delete Profile"
    });
    deleteButton.addEventListener("click", () => {
    });
    containerEl.createEl("h2", { text: "Exclusions" });
    new Obsidian.Setting(containerEl).setName("file_exclusions").setDesc("'Excluded file' matchers separated by a comma.").addText(
      (text) => text.setPlaceholder("drawings,prompts/logs").setValue(this.plugin.settings.file_exclusions).onChange(async (value) => {
        this.plugin.settings.file_exclusions = value;
        await this.plugin.saveSettings();
      })
    );
    new Obsidian.Setting(containerEl).setName("folder_exclusions").setDesc("'Excluded folder' matchers separated by a comma.").addText(
      (text) => text.setPlaceholder("drawings,prompts/logs").setValue(this.plugin.settings.folder_exclusions).onChange(async (value) => {
        this.plugin.settings.folder_exclusions = value;
        await this.plugin.saveSettings();
      })
    );
    new Obsidian.Setting(containerEl).setName("path_only").setDesc("'Path only' matchers separated by a comma.").addText(
      (text) => text.setPlaceholder("drawings,prompts/logs").setValue(this.plugin.settings.path_only).onChange(async (value) => {
        this.plugin.settings.path_only = value;
        await this.plugin.saveSettings();
      })
    );
    new Obsidian.Setting(containerEl).setName("header_exclusions").setDesc(
      "'Excluded header' matchers separated by a comma. Works for 'blocks' only."
    ).addText(
      (text) => text.setPlaceholder("drawings,prompts/logs").setValue(this.plugin.settings.header_exclusions).onChange(async (value) => {
        this.plugin.settings.header_exclusions = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h2", {
      text: "Display"
    });
    new Obsidian.Setting(containerEl).setName("show_full_path").setDesc("Show full path in view.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.show_full_path).onChange(async (value) => {
        this.plugin.settings.show_full_path = value;
        await this.plugin.saveSettings(true);
      })
    );
    new Obsidian.Setting(containerEl).setName("expanded_view").setDesc("Expanded view by default.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.expanded_view).onChange(async (value) => {
        this.plugin.settings.expanded_view = value;
        await this.plugin.saveSettings(true);
      })
    );
    new Obsidian.Setting(containerEl).setName("group_nearest_by_file").setDesc("Group nearest by file.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.group_nearest_by_file).onChange(async (value) => {
        this.plugin.settings.group_nearest_by_file = value;
        await this.plugin.saveSettings(true);
      })
    );
    new Obsidian.Setting(containerEl).setName("view_open").setDesc("Open view on Obsidian startup.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.view_open).onChange(async (value) => {
        this.plugin.settings.view_open = value;
        await this.plugin.saveSettings(true);
      })
    );
    containerEl.createEl("h2", {
      text: "Advanced"
    });
    new Obsidian.Setting(containerEl).setName("log_render").setDesc("Log render details to console (includes token_usage).").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.log_render).onChange(async (value) => {
        this.plugin.settings.log_render = value;
        await this.plugin.saveSettings(true);
      })
    );
    new Obsidian.Setting(containerEl).setName("log_render_files").setDesc("Log embedded objects paths with log render (for debugging).").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.log_render_files).onChange(async (value) => {
        this.plugin.settings.log_render_files = value;
        await this.plugin.saveSettings(true);
      })
    );
    new Obsidian.Setting(containerEl).setName("skip_sections").setDesc(
      "Skips making connections to specific sections within notes. Warning: reduces usefulness for large files and requires 'Force Refresh' for sections to work in the future."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.skip_sections).onChange(async (value) => {
        this.plugin.settings.skip_sections = value;
        await this.plugin.saveSettings(true);
      })
    );
    containerEl.createEl("h3", {
      text: "Test File Writing"
    });
    containerEl.createEl("h3", {
      text: "Manual Save"
    });
    let manual_save_results = containerEl.createEl("div");
    new Obsidian.Setting(containerEl).setName("manual_save").setDesc("Save current embeddings").addButton(
      (button) => button.setButtonText("Manual Save").onClick(async () => {
        if (confirm("Are you sure you want to save your current embeddings?")) {
          try {
            await this.plugin.save_embeddings_to_file(true);
            manual_save_results.innerHTML = "Embeddings saved successfully.";
          } catch (e) {
            manual_save_results.innerHTML = "Embeddings failed to save. Error: " + e;
          }
        }
      })
    );
    containerEl.createEl("h3", {
      text: "Previously failed files"
    });
    let failed_list = containerEl.createEl("div");
    this.draw_failed_files_list(failed_list);
    containerEl.createEl("h3", {
      text: "Force Refresh"
    });
    new Obsidian.Setting(containerEl).setName("force_refresh").setDesc(
      "WARNING: DO NOT use unless you know what you are doing! This will delete all of your current embeddings from OpenAI and trigger reprocessing of your entire vault!"
    ).addButton(
      (button) => button.setButtonText("Force Refresh").onClick(async () => {
        if (confirm(
          "Are you sure you want to Force Refresh? By clicking yes you confirm that you understand the consequences of this action."
        )) {
          await this.plugin.force_refresh_embeddings_file();
        }
      })
    );
    this.profileDropdown.components[0].selectEl.value = this.plugin.settings.selectedProfileIndex;
    this.selectedIndex = this.plugin.settings.selectedProfileIndex;
    if (this.selectedIndex != null && this.selectedIndex >= 0) {
      applyProfile();
    }
    console.log(this.endpointField.components[0].inputEl.value);
  }
  draw_failed_files_list(failed_list) {
    failed_list.empty();
    if (this.plugin.settings.failed_files.length > 0) {
      failed_list.createEl("p", {
        text: "The following files failed to process and will be skipped until manually retried."
      });
      let list = failed_list.createEl("ul");
      for (let failed_file of this.plugin.settings.failed_files) {
        list.createEl("li", {
          text: failed_file
        });
      }
      new Obsidian.Setting(failed_list).setName("retry_failed_files").setDesc("Retry failed files only").addButton(
        (button) => button.setButtonText("Retry failed files only").onClick(async () => {
          failed_list.empty();
          failed_list.createEl("p", {
            text: "Retrying failed files..."
          });
          await this.plugin.retry_failed_files();
          this.draw_failed_files_list(failed_list);
        })
      );
    } else {
      failed_list.createEl("p", {
        text: "No failed files"
      });
    }
  }
};
function line_is_heading(line) {
  return line.indexOf("#") === 0 && ["#", " "].indexOf(line[1]) !== -1;
}
var SMART_CONNECTIONS_CHAT_VIEW_TYPE = "smart-connections-chat-view";
module.exports = SmartConnectionsPlugin;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3ZlY19saXRlLmpzIiwgIi4uL3NyYy9pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsibW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBWZWNMaXRlIHtcclxuICAgIGNvbnN0cnVjdG9yKGNvbmZpZykge1xyXG4gICAgICB0aGlzLmNvbmZpZyA9IHtcclxuICAgICAgICBmaWxlX25hbWU6IFwiZW1iZWRkaW5ncy0zLmpzb25cIixcclxuICAgICAgICBmb2xkZXJfcGF0aDogXCIudmVjX2xpdGVcIixcclxuICAgICAgICBleGlzdHNfYWRhcHRlcjogbnVsbCxcclxuICAgICAgICBta2Rpcl9hZGFwdGVyOiBudWxsLFxyXG4gICAgICAgIHJlYWRfYWRhcHRlcjogbnVsbCxcclxuICAgICAgICByZW5hbWVfYWRhcHRlcjogbnVsbCxcclxuICAgICAgICBzdGF0X2FkYXB0ZXI6IG51bGwsXHJcbiAgICAgICAgd3JpdGVfYWRhcHRlcjogbnVsbCxcclxuICAgICAgICAuLi5jb25maWdcclxuICAgICAgfTtcclxuICAgICAgdGhpcy5maWxlX25hbWUgPSB0aGlzLmNvbmZpZy5maWxlX25hbWU7XHJcbiAgICAgIHRoaXMuZm9sZGVyX3BhdGggPSBjb25maWcuZm9sZGVyX3BhdGg7XHJcbiAgICAgIHRoaXMuZmlsZV9wYXRoID0gdGhpcy5mb2xkZXJfcGF0aCArIFwiL1wiICsgdGhpcy5maWxlX25hbWU7XHJcbiAgICAgIHRoaXMuZW1iZWRkaW5ncyA9IGZhbHNlO1xyXG4gICAgfVxyXG4gICAgYXN5bmMgZmlsZV9leGlzdHMocGF0aCkge1xyXG4gICAgICBpZiAodGhpcy5jb25maWcuZXhpc3RzX2FkYXB0ZXIpIHtcclxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jb25maWcuZXhpc3RzX2FkYXB0ZXIocGF0aCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZXhpc3RzX2FkYXB0ZXIgbm90IHNldFwiKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgYXN5bmMgbWtkaXIocGF0aCkge1xyXG4gICAgICBpZiAodGhpcy5jb25maWcubWtkaXJfYWRhcHRlcikge1xyXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmNvbmZpZy5ta2Rpcl9hZGFwdGVyKHBhdGgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIm1rZGlyX2FkYXB0ZXIgbm90IHNldFwiKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgYXN5bmMgcmVhZF9maWxlKHBhdGgpIHtcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLnJlYWRfYWRhcHRlcikge1xyXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmNvbmZpZy5yZWFkX2FkYXB0ZXIocGF0aCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwicmVhZF9hZGFwdGVyIG5vdCBzZXRcIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGFzeW5jIHJlbmFtZShvbGRfcGF0aCwgbmV3X3BhdGgpIHtcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLnJlbmFtZV9hZGFwdGVyKSB7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuY29uZmlnLnJlbmFtZV9hZGFwdGVyKG9sZF9wYXRoLCBuZXdfcGF0aCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwicmVuYW1lX2FkYXB0ZXIgbm90IHNldFwiKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgYXN5bmMgc3RhdChwYXRoKSB7XHJcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zdGF0X2FkYXB0ZXIpIHtcclxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jb25maWcuc3RhdF9hZGFwdGVyKHBhdGgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcInN0YXRfYWRhcHRlciBub3Qgc2V0XCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBhc3luYyB3cml0ZV9maWxlKHBhdGgsIGRhdGEpIHtcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLndyaXRlX2FkYXB0ZXIpIHtcclxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jb25maWcud3JpdGVfYWRhcHRlcihwYXRoLCBkYXRhKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ3cml0ZV9hZGFwdGVyIG5vdCBzZXRcIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGFzeW5jIGxvYWQocmV0cmllcyA9IDApIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBlbWJlZGRpbmdzX2ZpbGUgPSBhd2FpdCB0aGlzLnJlYWRfZmlsZSh0aGlzLmZpbGVfcGF0aCk7XHJcbiAgICAgICAgdGhpcy5lbWJlZGRpbmdzID0gSlNPTi5wYXJzZShlbWJlZGRpbmdzX2ZpbGUpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwibG9hZGVkIGVtYmVkZGluZ3MgZmlsZTogXCIgKyB0aGlzLmZpbGVfcGF0aCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgaWYgKHJldHJpZXMgPCAzKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhcInJldHJ5aW5nIGxvYWQoKVwiKTtcclxuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDFlMyArIDFlMyAqIHJldHJpZXMpKTtcclxuICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmxvYWQocmV0cmllcyArIDEpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAocmV0cmllcyA9PT0gMykge1xyXG4gICAgICAgICAgY29uc3QgZW1iZWRkaW5nc18yX2ZpbGVfcGF0aCA9IHRoaXMuZm9sZGVyX3BhdGggKyBcIi9lbWJlZGRpbmdzLTIuanNvblwiO1xyXG4gICAgICAgICAgY29uc3QgZW1iZWRkaW5nc18yX2ZpbGVfZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlX2V4aXN0cyhlbWJlZGRpbmdzXzJfZmlsZV9wYXRoKTtcclxuICAgICAgICAgIGlmIChlbWJlZGRpbmdzXzJfZmlsZV9leGlzdHMpIHtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5taWdyYXRlX2VtYmVkZGluZ3NfdjJfdG9fdjMoKTtcclxuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMubG9hZChyZXRyaWVzICsgMSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiZmFpbGVkIHRvIGxvYWQgZW1iZWRkaW5ncyBmaWxlLCBwcm9tcHQgdXNlciB0byBpbml0aWF0ZSBidWxrIGVtYmVkXCIpO1xyXG4gICAgICAgIGF3YWl0IGluaXRfZW1iZWRkaW5nc19maWxlKCk7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBhc3luYyBtaWdyYXRlX2VtYmVkZGluZ3NfdjJfdG9fdjMoKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKFwibWlncmF0aW5nIGVtYmVkZGluZ3MtMi5qc29uIHRvIGVtYmVkZGluZ3MtMy5qc29uXCIpO1xyXG4gICAgICBjb25zdCBlbWJlZGRpbmdzXzJfZmlsZV9wYXRoID0gdGhpcy5mb2xkZXJfcGF0aCArIFwiL2VtYmVkZGluZ3MtMi5qc29uXCI7XHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZ3NfMl9maWxlID0gYXdhaXQgdGhpcy5yZWFkX2ZpbGUoZW1iZWRkaW5nc18yX2ZpbGVfcGF0aCk7XHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZ3NfMiA9IEpTT04ucGFyc2UoZW1iZWRkaW5nc18yX2ZpbGUpO1xyXG4gICAgICBjb25zdCBlbWJlZGRpbmdzXzMgPSB7fTtcclxuICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZW1iZWRkaW5nc18yKSkge1xyXG4gICAgICAgIGNvbnN0IG5ld19vYmogPSB7XHJcbiAgICAgICAgICB2ZWM6IHZhbHVlLnZlYyxcclxuICAgICAgICAgIG1ldGE6IHt9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb25zdCBtZXRhID0gdmFsdWUubWV0YTtcclxuICAgICAgICBjb25zdCBuZXdfbWV0YSA9IHt9O1xyXG4gICAgICAgIGlmIChtZXRhLmhhc2gpXHJcbiAgICAgICAgICBuZXdfbWV0YS5oYXNoID0gbWV0YS5oYXNoO1xyXG4gICAgICAgIGlmIChtZXRhLmZpbGUpXHJcbiAgICAgICAgICBuZXdfbWV0YS5wYXJlbnQgPSBtZXRhLmZpbGU7XHJcbiAgICAgICAgaWYgKG1ldGEuYmxvY2tzKVxyXG4gICAgICAgICAgbmV3X21ldGEuY2hpbGRyZW4gPSBtZXRhLmJsb2NrcztcclxuICAgICAgICBpZiAobWV0YS5tdGltZSlcclxuICAgICAgICAgIG5ld19tZXRhLm10aW1lID0gbWV0YS5tdGltZTtcclxuICAgICAgICBpZiAobWV0YS5zaXplKVxyXG4gICAgICAgICAgbmV3X21ldGEuc2l6ZSA9IG1ldGEuc2l6ZTtcclxuICAgICAgICBpZiAobWV0YS5sZW4pXHJcbiAgICAgICAgICBuZXdfbWV0YS5zaXplID0gbWV0YS5sZW47XHJcbiAgICAgICAgaWYgKG1ldGEucGF0aClcclxuICAgICAgICAgIG5ld19tZXRhLnBhdGggPSBtZXRhLnBhdGg7XHJcbiAgICAgICAgbmV3X21ldGEuc3JjID0gXCJmaWxlXCI7XHJcbiAgICAgICAgbmV3X29iai5tZXRhID0gbmV3X21ldGE7XHJcbiAgICAgICAgZW1iZWRkaW5nc18zW2tleV0gPSBuZXdfb2JqO1xyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZ3NfM19maWxlID0gSlNPTi5zdHJpbmdpZnkoZW1iZWRkaW5nc18zKTtcclxuICAgICAgYXdhaXQgdGhpcy53cml0ZV9maWxlKHRoaXMuZmlsZV9wYXRoLCBlbWJlZGRpbmdzXzNfZmlsZSk7XHJcbiAgICB9XHJcbiAgICBhc3luYyBpbml0X2VtYmVkZGluZ3NfZmlsZSgpIHtcclxuICAgICAgaWYgKCFhd2FpdCB0aGlzLmZpbGVfZXhpc3RzKHRoaXMuZm9sZGVyX3BhdGgpKSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5ta2Rpcih0aGlzLmZvbGRlcl9wYXRoKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcImNyZWF0ZWQgZm9sZGVyOiBcIiArIHRoaXMuZm9sZGVyX3BhdGgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiZm9sZGVyIGFscmVhZHkgZXhpc3RzOiBcIiArIHRoaXMuZm9sZGVyX3BhdGgpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICghYXdhaXQgdGhpcy5maWxlX2V4aXN0cyh0aGlzLmZpbGVfcGF0aCkpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLndyaXRlX2ZpbGUodGhpcy5maWxlX3BhdGgsIFwie31cIik7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJjcmVhdGVkIGVtYmVkZGluZ3MgZmlsZTogXCIgKyB0aGlzLmZpbGVfcGF0aCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJlbWJlZGRpbmdzIGZpbGUgYWxyZWFkeSBleGlzdHM6IFwiICsgdGhpcy5maWxlX3BhdGgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBhc3luYyBzYXZlKCkge1xyXG4gICAgICBjb25zdCBlbWJlZGRpbmdzID0gSlNPTi5zdHJpbmdpZnkodGhpcy5lbWJlZGRpbmdzKTtcclxuICAgICAgY29uc3QgZW1iZWRkaW5nc19maWxlX2V4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZV9leGlzdHModGhpcy5maWxlX3BhdGgpO1xyXG4gICAgICBpZiAoZW1iZWRkaW5nc19maWxlX2V4aXN0cykge1xyXG4gICAgICAgIGNvbnN0IG5ld19maWxlX3NpemUgPSBlbWJlZGRpbmdzLmxlbmd0aDtcclxuICAgICAgICBjb25zdCBleGlzdGluZ19maWxlX3NpemUgPSBhd2FpdCB0aGlzLnN0YXQodGhpcy5maWxlX3BhdGgpLnRoZW4oKHN0YXQpID0+IHN0YXQuc2l6ZSk7XHJcbiAgICAgICAgaWYgKG5ld19maWxlX3NpemUgPiBleGlzdGluZ19maWxlX3NpemUgKiAwLjUpIHtcclxuICAgICAgICAgIGF3YWl0IHRoaXMud3JpdGVfZmlsZSh0aGlzLmZpbGVfcGF0aCwgZW1iZWRkaW5ncyk7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhcImVtYmVkZGluZ3MgZmlsZSBzaXplOiBcIiArIG5ld19maWxlX3NpemUgKyBcIiBieXRlc1wiKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29uc3Qgd2FybmluZ19tZXNzYWdlID0gW1xyXG4gICAgICAgICAgICBcIldhcm5pbmc6IE5ldyBlbWJlZGRpbmdzIGZpbGUgc2l6ZSBpcyBzaWduaWZpY2FudGx5IHNtYWxsZXIgdGhhbiBleGlzdGluZyBlbWJlZGRpbmdzIGZpbGUgc2l6ZS5cIixcclxuICAgICAgICAgICAgXCJBYm9ydGluZyB0byBwcmV2ZW50IHBvc3NpYmxlIGxvc3Mgb2YgZW1iZWRkaW5ncyBkYXRhLlwiLFxyXG4gICAgICAgICAgICBcIk5ldyBmaWxlIHNpemU6IFwiICsgbmV3X2ZpbGVfc2l6ZSArIFwiIGJ5dGVzLlwiLFxyXG4gICAgICAgICAgICBcIkV4aXN0aW5nIGZpbGUgc2l6ZTogXCIgKyBleGlzdGluZ19maWxlX3NpemUgKyBcIiBieXRlcy5cIixcclxuICAgICAgICAgICAgXCJSZXN0YXJ0aW5nIE9ic2lkaWFuIG1heSBmaXggdGhpcy5cIlxyXG4gICAgICAgICAgXTtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKHdhcm5pbmdfbWVzc2FnZS5qb2luKFwiIFwiKSk7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLndyaXRlX2ZpbGUodGhpcy5mb2xkZXJfcGF0aCArIFwiL3Vuc2F2ZWQtZW1iZWRkaW5ncy5qc29uXCIsIGVtYmVkZGluZ3MpO1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3I6IE5ldyBlbWJlZGRpbmdzIGZpbGUgc2l6ZSBpcyBzaWduaWZpY2FudGx5IHNtYWxsZXIgdGhhbiBleGlzdGluZyBlbWJlZGRpbmdzIGZpbGUgc2l6ZS4gQWJvcnRpbmcgdG8gcHJldmVudCBwb3NzaWJsZSBsb3NzIG9mIGVtYmVkZGluZ3MgZGF0YS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGF3YWl0IHRoaXMuaW5pdF9lbWJlZGRpbmdzX2ZpbGUoKTtcclxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5zYXZlKCk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcbiAgICBjb3Nfc2ltKHZlY3RvcjEsIHZlY3RvcjIpIHtcclxuICAgICAgbGV0IGRvdFByb2R1Y3QgPSAwO1xyXG4gICAgICBsZXQgbm9ybUEgPSAwO1xyXG4gICAgICBsZXQgbm9ybUIgPSAwO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZlY3RvcjEubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBkb3RQcm9kdWN0ICs9IHZlY3RvcjFbaV0gKiB2ZWN0b3IyW2ldO1xyXG4gICAgICAgIG5vcm1BICs9IHZlY3RvcjFbaV0gKiB2ZWN0b3IxW2ldO1xyXG4gICAgICAgIG5vcm1CICs9IHZlY3RvcjJbaV0gKiB2ZWN0b3IyW2ldO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChub3JtQSA9PT0gMCB8fCBub3JtQiA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybiAwO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBkb3RQcm9kdWN0IC8gKE1hdGguc3FydChub3JtQSkgKiBNYXRoLnNxcnQobm9ybUIpKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgbmVhcmVzdCh0b192ZWMsIGZpbHRlciA9IHt9KSB7XHJcbiAgICAgIGZpbHRlciA9IHtcclxuICAgICAgICByZXN1bHRzX2NvdW50OiAzMCxcclxuICAgICAgICAuLi5maWx0ZXJcclxuICAgICAgfTtcclxuICAgICAgbGV0IG5lYXJlc3QgPSBbXTtcclxuICAgICAgY29uc3QgZnJvbV9rZXlzID0gT2JqZWN0LmtleXModGhpcy5lbWJlZGRpbmdzKTtcclxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmcm9tX2tleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAoZmlsdGVyLnNraXBfc2VjdGlvbnMpIHtcclxuICAgICAgICAgIGNvbnN0IGZyb21fcGF0aCA9IHRoaXMuZW1iZWRkaW5nc1tmcm9tX2tleXNbaV1dLm1ldGEucGF0aDtcclxuICAgICAgICAgIGlmIChmcm9tX3BhdGguaW5kZXhPZihcIiNcIikgPiAtMSlcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChmaWx0ZXIuc2tpcF9rZXkpIHtcclxuICAgICAgICAgIGlmIChmaWx0ZXIuc2tpcF9rZXkgPT09IGZyb21fa2V5c1tpXSlcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICBpZiAoZmlsdGVyLnNraXBfa2V5ID09PSB0aGlzLmVtYmVkZGluZ3NbZnJvbV9rZXlzW2ldXS5tZXRhLnBhcmVudClcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChmaWx0ZXIucGF0aF9iZWdpbnNfd2l0aCkge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiBmaWx0ZXIucGF0aF9iZWdpbnNfd2l0aCA9PT0gXCJzdHJpbmdcIiAmJiAhdGhpcy5lbWJlZGRpbmdzW2Zyb21fa2V5c1tpXV0ubWV0YS5wYXRoLnN0YXJ0c1dpdGgoZmlsdGVyLnBhdGhfYmVnaW5zX3dpdGgpKVxyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGZpbHRlci5wYXRoX2JlZ2luc193aXRoKSAmJiAhZmlsdGVyLnBhdGhfYmVnaW5zX3dpdGguc29tZSgocGF0aCkgPT4gdGhpcy5lbWJlZGRpbmdzW2Zyb21fa2V5c1tpXV0ubWV0YS5wYXRoLnN0YXJ0c1dpdGgocGF0aCkpKVxyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbmVhcmVzdC5wdXNoKHtcclxuICAgICAgICAgIGxpbms6IHRoaXMuZW1iZWRkaW5nc1tmcm9tX2tleXNbaV1dLm1ldGEucGF0aCxcclxuICAgICAgICAgIHNpbWlsYXJpdHk6IHRoaXMuY29zX3NpbSh0b192ZWMsIHRoaXMuZW1iZWRkaW5nc1tmcm9tX2tleXNbaV1dLnZlYyksXHJcbiAgICAgICAgICBzaXplOiB0aGlzLmVtYmVkZGluZ3NbZnJvbV9rZXlzW2ldXS5tZXRhLnNpemVcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICBuZWFyZXN0LnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcclxuICAgICAgICByZXR1cm4gYi5zaW1pbGFyaXR5IC0gYS5zaW1pbGFyaXR5O1xyXG4gICAgICB9KTtcclxuICAgICAgbmVhcmVzdCA9IG5lYXJlc3Quc2xpY2UoMCwgZmlsdGVyLnJlc3VsdHNfY291bnQpO1xyXG4gICAgICByZXR1cm4gbmVhcmVzdDtcclxuICAgIH1cclxuICAgIGZpbmRfbmVhcmVzdF9lbWJlZGRpbmdzKHRvX3ZlYywgZmlsdGVyID0ge30pIHtcclxuICAgICAgY29uc3QgZGVmYXVsdF9maWx0ZXIgPSB7XHJcbiAgICAgICAgbWF4OiB0aGlzLm1heF9zb3VyY2VzXHJcbiAgICAgIH07XHJcbiAgICAgIGZpbHRlciA9IHsgLi4uZGVmYXVsdF9maWx0ZXIsIC4uLmZpbHRlciB9O1xyXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh0b192ZWMpICYmIHRvX3ZlYy5sZW5ndGggIT09IHRoaXMudmVjX2xlbikge1xyXG4gICAgICAgIHRoaXMubmVhcmVzdCA9IHt9O1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG9fdmVjLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICB0aGlzLmZpbmRfbmVhcmVzdF9lbWJlZGRpbmdzKHRvX3ZlY1tpXSwge1xyXG4gICAgICAgICAgICBtYXg6IE1hdGguZmxvb3IoZmlsdGVyLm1heCAvIHRvX3ZlYy5sZW5ndGgpXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc3QgZnJvbV9rZXlzID0gT2JqZWN0LmtleXModGhpcy5lbWJlZGRpbmdzKTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZyb21fa2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgaWYgKHRoaXMudmFsaWRhdGVfdHlwZSh0aGlzLmVtYmVkZGluZ3NbZnJvbV9rZXlzW2ldXSkpXHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgY29uc3Qgc2ltID0gdGhpcy5jb21wdXRlQ29zaW5lU2ltaWxhcml0eSh0b192ZWMsIHRoaXMuZW1iZWRkaW5nc1tmcm9tX2tleXNbaV1dLnZlYyk7XHJcbiAgICAgICAgICBpZiAodGhpcy5uZWFyZXN0W2Zyb21fa2V5c1tpXV0pIHtcclxuICAgICAgICAgICAgdGhpcy5uZWFyZXN0W2Zyb21fa2V5c1tpXV0gKz0gc2ltO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5uZWFyZXN0W2Zyb21fa2V5c1tpXV0gPSBzaW07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIGxldCBuZWFyZXN0ID0gT2JqZWN0LmtleXModGhpcy5uZWFyZXN0KS5tYXAoKGtleSkgPT4ge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBrZXksXHJcbiAgICAgICAgICBzaW1pbGFyaXR5OiB0aGlzLm5lYXJlc3Rba2V5XVxyXG4gICAgICAgIH07XHJcbiAgICAgIH0pO1xyXG4gICAgICBuZWFyZXN0ID0gdGhpcy5zb3J0X2J5X3NpbWlsYXJpdHkobmVhcmVzdCk7XHJcbiAgICAgIG5lYXJlc3QgPSBuZWFyZXN0LnNsaWNlKDAsIGZpbHRlci5tYXgpO1xyXG4gICAgICBuZWFyZXN0ID0gbmVhcmVzdC5tYXAoKGl0ZW0pID0+IHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgbGluazogdGhpcy5lbWJlZGRpbmdzW2l0ZW0ua2V5XS5tZXRhLnBhdGgsXHJcbiAgICAgICAgICBzaW1pbGFyaXR5OiBpdGVtLnNpbWlsYXJpdHksXHJcbiAgICAgICAgICBsZW46IHRoaXMuZW1iZWRkaW5nc1tpdGVtLmtleV0ubWV0YS5sZW4gfHwgdGhpcy5lbWJlZGRpbmdzW2l0ZW0ua2V5XS5tZXRhLnNpemVcclxuICAgICAgICB9O1xyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuIG5lYXJlc3Q7XHJcbiAgICB9XHJcbiAgICBzb3J0X2J5X3NpbWlsYXJpdHkobmVhcmVzdCkge1xyXG4gICAgICByZXR1cm4gbmVhcmVzdC5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XHJcbiAgICAgICAgY29uc3QgYV9zY29yZSA9IGEuc2ltaWxhcml0eTtcclxuICAgICAgICBjb25zdCBiX3Njb3JlID0gYi5zaW1pbGFyaXR5O1xyXG4gICAgICAgIGlmIChhX3Njb3JlID4gYl9zY29yZSlcclxuICAgICAgICAgIHJldHVybiAtMTtcclxuICAgICAgICBpZiAoYV9zY29yZSA8IGJfc2NvcmUpXHJcbiAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICByZXR1cm4gMDtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICAvLyBjaGVjayBpZiBrZXkgZnJvbSBlbWJlZGRpbmdzIGV4aXN0cyBpbiBmaWxlc1xyXG4gICAgY2xlYW5fdXBfZW1iZWRkaW5ncyhmaWxlcykge1xyXG4gICAgICBjb25zb2xlLmxvZyhcImNsZWFuaW5nIHVwIGVtYmVkZGluZ3NcIik7XHJcbiAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLmVtYmVkZGluZ3MpO1xyXG4gICAgICBsZXQgZGVsZXRlZF9lbWJlZGRpbmdzID0gMDtcclxuICAgICAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xyXG4gICAgICAgIGNvbnN0IHBhdGggPSB0aGlzLmVtYmVkZGluZ3Nba2V5XS5tZXRhLnBhdGg7XHJcbiAgICAgICAgaWYgKCFmaWxlcy5maW5kKChmaWxlKSA9PiBwYXRoLnN0YXJ0c1dpdGgoZmlsZS5wYXRoKSkpIHtcclxuICAgICAgICAgIGRlbGV0ZSB0aGlzLmVtYmVkZGluZ3Nba2V5XTtcclxuICAgICAgICAgIGRlbGV0ZWRfZW1iZWRkaW5ncysrO1xyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChwYXRoLmluZGV4T2YoXCIjXCIpID4gLTEpIHtcclxuICAgICAgICAgIGNvbnN0IHBhcmVudF9rZXkgPSB0aGlzLmVtYmVkZGluZ3Nba2V5XS5tZXRhLnBhcmVudDtcclxuICAgICAgICAgIGlmICghdGhpcy5lbWJlZGRpbmdzW3BhcmVudF9rZXldKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmVtYmVkZGluZ3Nba2V5XTtcclxuICAgICAgICAgICAgZGVsZXRlZF9lbWJlZGRpbmdzKys7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKCF0aGlzLmVtYmVkZGluZ3NbcGFyZW50X2tleV0ubWV0YSkge1xyXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5lbWJlZGRpbmdzW2tleV07XHJcbiAgICAgICAgICAgIGRlbGV0ZWRfZW1iZWRkaW5ncysrO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICh0aGlzLmVtYmVkZGluZ3NbcGFyZW50X2tleV0ubWV0YS5jaGlsZHJlbiAmJiB0aGlzLmVtYmVkZGluZ3NbcGFyZW50X2tleV0ubWV0YS5jaGlsZHJlbi5pbmRleE9mKGtleSkgPCAwKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmVtYmVkZGluZ3Nba2V5XTtcclxuICAgICAgICAgICAgZGVsZXRlZF9lbWJlZGRpbmdzKys7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4geyBkZWxldGVkX2VtYmVkZGluZ3MsIHRvdGFsX2VtYmVkZGluZ3M6IGtleXMubGVuZ3RoIH07XHJcbiAgICB9XHJcbiAgICBnZXQoa2V5KSB7XHJcbiAgICAgIHJldHVybiB0aGlzLmVtYmVkZGluZ3Nba2V5XSB8fCBudWxsO1xyXG4gICAgfVxyXG4gICAgZ2V0X21ldGEoa2V5KSB7XHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZyA9IHRoaXMuZ2V0KGtleSk7XHJcbiAgICAgIGlmIChlbWJlZGRpbmcgJiYgZW1iZWRkaW5nLm1ldGEpIHtcclxuICAgICAgICByZXR1cm4gZW1iZWRkaW5nLm1ldGE7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBnZXRfbXRpbWUoa2V5KSB7XHJcbiAgICAgIGNvbnN0IG1ldGEgPSB0aGlzLmdldF9tZXRhKGtleSk7XHJcbiAgICAgIGlmIChtZXRhICYmIG1ldGEubXRpbWUpIHtcclxuICAgICAgICByZXR1cm4gbWV0YS5tdGltZTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGdldF9oYXNoKGtleSkge1xyXG4gICAgICBjb25zdCBtZXRhID0gdGhpcy5nZXRfbWV0YShrZXkpO1xyXG4gICAgICBpZiAobWV0YSAmJiBtZXRhLmhhc2gpIHtcclxuICAgICAgICByZXR1cm4gbWV0YS5oYXNoO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgZ2V0X3NpemUoa2V5KSB7XHJcbiAgICAgIGNvbnN0IG1ldGEgPSB0aGlzLmdldF9tZXRhKGtleSk7XHJcbiAgICAgIGlmIChtZXRhICYmIG1ldGEuc2l6ZSkge1xyXG4gICAgICAgIHJldHVybiBtZXRhLnNpemU7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBnZXRfY2hpbGRyZW4oa2V5KSB7XHJcbiAgICAgIGNvbnN0IG1ldGEgPSB0aGlzLmdldF9tZXRhKGtleSk7XHJcbiAgICAgIGlmIChtZXRhICYmIG1ldGEuY2hpbGRyZW4pIHtcclxuICAgICAgICByZXR1cm4gbWV0YS5jaGlsZHJlbjtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGdldF92ZWMoa2V5KSB7XHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZyA9IHRoaXMuZ2V0KGtleSk7XHJcbiAgICAgIGlmIChlbWJlZGRpbmcgJiYgZW1iZWRkaW5nLnZlYykge1xyXG4gICAgICAgIHJldHVybiBlbWJlZGRpbmcudmVjO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgc2F2ZV9lbWJlZGRpbmcoa2V5LCB2ZWMsIG1ldGEpIHtcclxuICAgICAgdGhpcy5lbWJlZGRpbmdzW2tleV0gPSB7XHJcbiAgICAgICAgdmVjLFxyXG4gICAgICAgIG1ldGFcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIG10aW1lX2lzX2N1cnJlbnQoa2V5LCBzb3VyY2VfbXRpbWUpIHtcclxuICAgICAgY29uc3QgbXRpbWUgPSB0aGlzLmdldF9tdGltZShrZXkpO1xyXG4gICAgICBpZiAobXRpbWUgJiYgbXRpbWUgPj0gc291cmNlX210aW1lKSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgYXN5bmMgZm9yY2VfcmVmcmVzaCgpIHtcclxuICAgICAgdGhpcy5lbWJlZGRpbmdzID0gbnVsbDtcclxuICAgICAgdGhpcy5lbWJlZGRpbmdzID0ge307XHJcbiAgICAgIGxldCBjdXJyZW50X2RhdGV0aW1lID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMWUzKTtcclxuICAgICAgYXdhaXQgdGhpcy5yZW5hbWUodGhpcy5maWxlX3BhdGgsIHRoaXMuZm9sZGVyX3BhdGggKyBcIi9lbWJlZGRpbmdzLVwiICsgY3VycmVudF9kYXRldGltZSArIFwiLmpzb25cIik7XHJcbiAgICAgIGF3YWl0IHRoaXMuaW5pdF9lbWJlZGRpbmdzX2ZpbGUoKTtcclxuICAgIH1cclxuICB9O1xyXG4gICIsICJjb25zdCBPYnNpZGlhbiA9IHJlcXVpcmUoXCJvYnNpZGlhblwiKTtcclxuY29uc3QgVmVjTGl0ZSA9IHJlcXVpcmUoXCIuL3ZlY19saXRlXCIpO1xyXG5cclxuY29uc3QgREVGQVVMVF9TRVRUSU5HUyA9IHtcclxuICBmaWxlX2V4Y2x1c2lvbnM6IFwiXCIsXHJcbiAgZm9sZGVyX2V4Y2x1c2lvbnM6IFwiXCIsXHJcbiAgaGVhZGVyX2V4Y2x1c2lvbnM6IFwiXCIsXHJcbiAgcGF0aF9vbmx5OiBcIlwiLFxyXG4gIHNob3dfZnVsbF9wYXRoOiBmYWxzZSxcclxuICBleHBhbmRlZF92aWV3OiB0cnVlLFxyXG4gIGdyb3VwX25lYXJlc3RfYnlfZmlsZTogZmFsc2UsXHJcbiAgbGFuZ3VhZ2U6IFwiZW5cIixcclxuICBsb2dfcmVuZGVyOiBmYWxzZSxcclxuICBsb2dfcmVuZGVyX2ZpbGVzOiBmYWxzZSxcclxuICByZWNlbnRseV9zZW50X3JldHJ5X25vdGljZTogZmFsc2UsXHJcbiAgc2tpcF9zZWN0aW9uczogZmFsc2UsXHJcbiAgdmlld19vcGVuOiB0cnVlLFxyXG4gIHZlcnNpb246IFwiXCIsXHJcbn07XHJcbmNvbnN0IE1BWF9FTUJFRF9TVFJJTkdfTEVOR1RIID0gMjUwMDA7XHJcblxyXG5sZXQgVkVSU0lPTjtcclxuY29uc3QgU1VQUE9SVEVEX0ZJTEVfVFlQRVMgPSBbXCJtZFwiLCBcImNhbnZhc1wiXTtcclxuXHJcbi8vIHJlcXVpcmUgYnVpbHQtaW4gY3J5cHRvIG1vZHVsZVxyXG5jb25zdCBjcnlwdG8gPSByZXF1aXJlKFwiY3J5cHRvXCIpO1xyXG4vLyBtZDUgaGFzaCB1c2luZyBidWlsdCBpbiBjcnlwdG8gbW9kdWxlXHJcbmZ1bmN0aW9uIG1kNShzdHIpIHtcclxuICByZXR1cm4gY3J5cHRvLmNyZWF0ZUhhc2goXCJtZDVcIikudXBkYXRlKHN0cikuZGlnZXN0KFwiaGV4XCIpO1xyXG59XHJcblxyXG5jbGFzcyBTbWFydENvbm5lY3Rpb25zUGx1Z2luIGV4dGVuZHMgT2JzaWRpYW4uUGx1Z2luIHtcclxuICAvLyBjb25zdHJ1Y3RvclxyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgc3VwZXIoLi4uYXJndW1lbnRzKTtcclxuICAgIHRoaXMuYXBpID0gbnVsbDtcclxuICAgIHRoaXMuZW1iZWRkaW5nc19sb2FkZWQgPSBmYWxzZTtcclxuICAgIHRoaXMuZmlsZV9leGNsdXNpb25zID0gW107XHJcbiAgICB0aGlzLmZvbGRlcnMgPSBbXTtcclxuICAgIHRoaXMuaGFzX25ld19lbWJlZGRpbmdzID0gZmFsc2U7XHJcbiAgICB0aGlzLmhlYWRlcl9leGNsdXNpb25zID0gW107XHJcbiAgICB0aGlzLm5lYXJlc3RfY2FjaGUgPSB7fTtcclxuICAgIHRoaXMucGF0aF9vbmx5ID0gW107XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cgPSB7fTtcclxuICAgIHRoaXMucmVuZGVyX2xvZy5kZWxldGVkX2VtYmVkZGluZ3MgPSAwO1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLmV4Y2x1c2lvbnNfbG9ncyA9IHt9O1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLmZhaWxlZF9lbWJlZGRpbmdzID0gW107XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cuZmlsZXMgPSBbXTtcclxuICAgIHRoaXMucmVuZGVyX2xvZy5uZXdfZW1iZWRkaW5ncyA9IDA7XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cuc2tpcHBlZF9sb3dfZGVsdGEgPSB7fTtcclxuICAgIHRoaXMucmVuZGVyX2xvZy50b2tlbl91c2FnZSA9IDA7XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cudG9rZW5zX3NhdmVkX2J5X2NhY2hlID0gMDtcclxuICAgIHRoaXMucmV0cnlfbm90aWNlX3RpbWVvdXQgPSBudWxsO1xyXG4gICAgdGhpcy5zYXZlX3RpbWVvdXQgPSBudWxsO1xyXG4gICAgdGhpcy5zY19icmFuZGluZyA9IHt9O1xyXG4gICAgdGhpcy5zZWxmX3JlZl9rd19yZWdleCA9IG51bGw7XHJcbiAgICB0aGlzLnVwZGF0ZV9hdmFpbGFibGUgPSBmYWxzZTtcclxuICB9XHJcblxyXG4gIGFzeW5jIG9ubG9hZCgpIHtcclxuICAgIC8vIGluaXRpYWxpemUgd2hlbiBsYXlvdXQgaXMgcmVhZHlcclxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KHRoaXMuaW5pdGlhbGl6ZS5iaW5kKHRoaXMpKTtcclxuICB9XHJcbiAgb251bmxvYWQoKSB7XHJcbiAgICB0aGlzLm91dHB1dF9yZW5kZXJfbG9nKCk7XHJcbiAgICBjb25zb2xlLmxvZyhcInVubG9hZGluZyBwbHVnaW5cIik7XHJcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2UuZGV0YWNoTGVhdmVzT2ZUeXBlKFNNQVJUX0NPTk5FQ1RJT05TX1ZJRVdfVFlQRSk7XHJcbiAgfVxyXG4gIGFzeW5jIGluaXRpYWxpemUoKSB7XHJcbiAgICBjb25zb2xlLmxvZyhcIkxvYWRpbmcgU21hcnQgQ29ubmVjdGlvbnMgcGx1Z2luXCIpO1xyXG4gICAgVkVSU0lPTiA9IHRoaXMubWFuaWZlc3QudmVyc2lvbjtcclxuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XHJcbiAgICB0aGlzLmluaXRpYWxpemVQcm9maWxlcygpO1xyXG5cclxuICAgIHRoaXMuYWRkSWNvbigpO1xyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwic2MtZmluZC1ub3Rlc1wiLFxyXG4gICAgICBuYW1lOiBcIkZpbmQ6IE1ha2UgU21hcnQgQ29ubmVjdGlvbnNcIixcclxuICAgICAgaWNvbjogXCJwZW5jaWxfaWNvblwiLFxyXG4gICAgICBob3RrZXlzOiBbXSxcclxuICAgICAgLy8gZWRpdG9yQ2FsbGJhY2s6IGFzeW5jIChlZGl0b3IpID0+IHtcclxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IGFzeW5jIChlZGl0b3IpID0+IHtcclxuICAgICAgICBpZiAoZWRpdG9yLnNvbWV0aGluZ1NlbGVjdGVkKCkpIHtcclxuICAgICAgICAgIC8vIGdldCBzZWxlY3RlZCB0ZXh0XHJcbiAgICAgICAgICBsZXQgc2VsZWN0ZWRfdGV4dCA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcclxuICAgICAgICAgIC8vIHJlbmRlciBjb25uZWN0aW9ucyBmcm9tIHNlbGVjdGVkIHRleHRcclxuICAgICAgICAgIGF3YWl0IHRoaXMubWFrZV9jb25uZWN0aW9ucyhzZWxlY3RlZF90ZXh0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8gY2xlYXIgbmVhcmVzdF9jYWNoZSBvbiBtYW51YWwgY2FsbCB0byBtYWtlIGNvbm5lY3Rpb25zXHJcbiAgICAgICAgICB0aGlzLm5lYXJlc3RfY2FjaGUgPSB7fTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMubWFrZV9jb25uZWN0aW9ucygpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwic21hcnQtY29ubmVjdGlvbnMtdmlld1wiLFxyXG4gICAgICBuYW1lOiBcIk9wZW46IFZpZXcgU21hcnQgQ29ubmVjdGlvbnNcIixcclxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcclxuICAgICAgICB0aGlzLm9wZW5fdmlldygpO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICAvLyBvcGVuIHJhbmRvbSBub3RlIGZyb20gbmVhcmVzdCBjYWNoZVxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwic21hcnQtY29ubmVjdGlvbnMtcmFuZG9tXCIsXHJcbiAgICAgIG5hbWU6IFwiT3BlbjogUmFuZG9tIE5vdGUgZnJvbSBTbWFydCBDb25uZWN0aW9uc1wiLFxyXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xyXG4gICAgICAgIHRoaXMub3Blbl9yYW5kb21fbm90ZSgpO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICAvLyBhZGQgc2V0dGluZ3MgdGFiXHJcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFNtYXJ0Q29ubmVjdGlvbnNTZXR0aW5nc1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG4gICAgLy8gcmVnaXN0ZXIgbWFpbiB2aWV3IHR5cGVcclxuICAgIHRoaXMucmVnaXN0ZXJWaWV3KFxyXG4gICAgICBTTUFSVF9DT05ORUNUSU9OU19WSUVXX1RZUEUsXHJcbiAgICAgIChsZWFmKSA9PiBuZXcgU21hcnRDb25uZWN0aW9uc1ZpZXcobGVhZiwgdGhpcylcclxuICAgICk7XHJcblxyXG4gICAgLy8gaWYgdGhpcyBzZXR0aW5ncy52aWV3X29wZW4gaXMgdHJ1ZSwgb3BlbiB2aWV3IG9uIHN0YXJ0dXBcclxuICAgIGlmICh0aGlzLnNldHRpbmdzLnZpZXdfb3Blbikge1xyXG4gICAgICB0aGlzLm9wZW5fdmlldygpO1xyXG4gICAgfVxyXG4gICAgLy8gb24gbmV3IHZlcnNpb25cclxuICAgIGlmICh0aGlzLnNldHRpbmdzLnZlcnNpb24gIT09IFZFUlNJT04pIHtcclxuICAgICAgLy8gdXBkYXRlIHZlcnNpb25cclxuICAgICAgdGhpcy5zZXR0aW5ncy52ZXJzaW9uID0gVkVSU0lPTjtcclxuICAgICAgLy8gc2F2ZSBzZXR0aW5nc1xyXG4gICAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAvLyBvcGVuIHZpZXdcclxuICAgICAgdGhpcy5vcGVuX3ZpZXcoKTtcclxuICAgIH1cclxuICAgIC8vIGNoZWNrIGdpdGh1YiByZWxlYXNlIGVuZHBvaW50IGlmIHVwZGF0ZSBpcyBhdmFpbGFibGVcclxuICAgIHRoaXMuYWRkX3RvX2dpdGlnbm9yZSgpO1xyXG4gICAgLyoqXHJcbiAgICAgKiBFWFBFUklNRU5UQUxcclxuICAgICAqIC0gd2luZG93LWJhc2VkIEFQSSBhY2Nlc3NcclxuICAgICAqIC0gY29kZS1ibG9jayByZW5kZXJpbmdcclxuICAgICAqL1xyXG4gICAgdGhpcy5hcGkgPSBuZXcgU2NTZWFyY2hBcGkodGhpcy5hcHAsIHRoaXMpO1xyXG4gICAgLy8gcmVnaXN0ZXIgQVBJIHRvIGdsb2JhbCB3aW5kb3cgb2JqZWN0XHJcbiAgICAod2luZG93W1wiU21hcnRTZWFyY2hBcGlcIl0gPSB0aGlzLmFwaSkgJiZcclxuICAgICAgdGhpcy5yZWdpc3RlcigoKSA9PiBkZWxldGUgd2luZG93W1wiU21hcnRTZWFyY2hBcGlcIl0pO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgaW5pdF92ZWNzKGZpbGVfbmFtZSA9IFwiZW1iZWRkaW5ncy0zLmpzb25cIikge1xyXG4gICAgdGhpcy5zbWFydF92ZWNfbGl0ZSA9IG5ldyBWZWNMaXRlKHtcclxuICAgICAgZmlsZV9uYW1lOiBmaWxlX25hbWUsXHJcbiAgICAgIGZvbGRlcl9wYXRoOiBcIi5zbWFydC1jb25uZWN0aW9uc1wiLFxyXG4gICAgICBleGlzdHNfYWRhcHRlcjogdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMuYmluZChcclxuICAgICAgICB0aGlzLmFwcC52YXVsdC5hZGFwdGVyXHJcbiAgICAgICksXHJcbiAgICAgIG1rZGlyX2FkYXB0ZXI6IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIubWtkaXIuYmluZCh0aGlzLmFwcC52YXVsdC5hZGFwdGVyKSxcclxuICAgICAgcmVhZF9hZGFwdGVyOiB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLnJlYWQuYmluZCh0aGlzLmFwcC52YXVsdC5hZGFwdGVyKSxcclxuICAgICAgcmVuYW1lX2FkYXB0ZXI6IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVuYW1lLmJpbmQoXHJcbiAgICAgICAgdGhpcy5hcHAudmF1bHQuYWRhcHRlclxyXG4gICAgICApLFxyXG4gICAgICBzdGF0X2FkYXB0ZXI6IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuc3RhdC5iaW5kKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIpLFxyXG4gICAgICB3cml0ZV9hZGFwdGVyOiB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLndyaXRlLmJpbmQodGhpcy5hcHAudmF1bHQuYWRhcHRlciksXHJcbiAgICB9KTtcclxuICAgIHRoaXMuZW1iZWRkaW5nc19sb2FkZWQgPSBhd2FpdCB0aGlzLnNtYXJ0X3ZlY19saXRlLmxvYWQoKTtcclxuICAgIHJldHVybiB0aGlzLmVtYmVkZGluZ3NfbG9hZGVkO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgbG9hZFNldHRpbmdzKCkge1xyXG4gICAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XHJcbiAgICAvLyBsb2FkIGZpbGUgZXhjbHVzaW9ucyBpZiBub3QgYmxhbmtcclxuICAgIGlmIChcclxuICAgICAgdGhpcy5zZXR0aW5ncy5maWxlX2V4Y2x1c2lvbnMgJiZcclxuICAgICAgdGhpcy5zZXR0aW5ncy5maWxlX2V4Y2x1c2lvbnMubGVuZ3RoID4gMFxyXG4gICAgKSB7XHJcbiAgICAgIC8vIHNwbGl0IGZpbGUgZXhjbHVzaW9ucyBpbnRvIGFycmF5IGFuZCB0cmltIHdoaXRlc3BhY2VcclxuICAgICAgdGhpcy5maWxlX2V4Y2x1c2lvbnMgPSB0aGlzLnNldHRpbmdzLmZpbGVfZXhjbHVzaW9uc1xyXG4gICAgICAgIC5zcGxpdChcIixcIilcclxuICAgICAgICAubWFwKChmaWxlKSA9PiB7XHJcbiAgICAgICAgICByZXR1cm4gZmlsZS50cmltKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICAvLyBsb2FkIGZvbGRlciBleGNsdXNpb25zIGlmIG5vdCBibGFua1xyXG4gICAgaWYgKFxyXG4gICAgICB0aGlzLnNldHRpbmdzLmZvbGRlcl9leGNsdXNpb25zICYmXHJcbiAgICAgIHRoaXMuc2V0dGluZ3MuZm9sZGVyX2V4Y2x1c2lvbnMubGVuZ3RoID4gMFxyXG4gICAgKSB7XHJcbiAgICAgIC8vIGFkZCBzbGFzaCB0byBlbmQgb2YgZm9sZGVyIG5hbWUgaWYgbm90IHByZXNlbnRcclxuICAgICAgY29uc3QgZm9sZGVyX2V4Y2x1c2lvbnMgPSB0aGlzLnNldHRpbmdzLmZvbGRlcl9leGNsdXNpb25zXHJcbiAgICAgICAgLnNwbGl0KFwiLFwiKVxyXG4gICAgICAgIC5tYXAoKGZvbGRlcikgPT4ge1xyXG4gICAgICAgICAgLy8gdHJpbSB3aGl0ZXNwYWNlXHJcbiAgICAgICAgICBmb2xkZXIgPSBmb2xkZXIudHJpbSgpO1xyXG4gICAgICAgICAgaWYgKGZvbGRlci5zbGljZSgtMSkgIT09IFwiL1wiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb2xkZXIgKyBcIi9cIjtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb2xkZXI7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIC8vIG1lcmdlIGZvbGRlciBleGNsdXNpb25zIHdpdGggZmlsZSBleGNsdXNpb25zXHJcbiAgICAgIHRoaXMuZmlsZV9leGNsdXNpb25zID0gdGhpcy5maWxlX2V4Y2x1c2lvbnMuY29uY2F0KGZvbGRlcl9leGNsdXNpb25zKTtcclxuICAgIH1cclxuICAgIC8vIGxvYWQgaGVhZGVyIGV4Y2x1c2lvbnMgaWYgbm90IGJsYW5rXHJcbiAgICBpZiAoXHJcbiAgICAgIHRoaXMuc2V0dGluZ3MuaGVhZGVyX2V4Y2x1c2lvbnMgJiZcclxuICAgICAgdGhpcy5zZXR0aW5ncy5oZWFkZXJfZXhjbHVzaW9ucy5sZW5ndGggPiAwXHJcbiAgICApIHtcclxuICAgICAgdGhpcy5oZWFkZXJfZXhjbHVzaW9ucyA9IHRoaXMuc2V0dGluZ3MuaGVhZGVyX2V4Y2x1c2lvbnNcclxuICAgICAgICAuc3BsaXQoXCIsXCIpXHJcbiAgICAgICAgLm1hcCgoaGVhZGVyKSA9PiB7XHJcbiAgICAgICAgICByZXR1cm4gaGVhZGVyLnRyaW0oKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIC8vIGxvYWQgcGF0aF9vbmx5IGlmIG5vdCBibGFua1xyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MucGF0aF9vbmx5ICYmIHRoaXMuc2V0dGluZ3MucGF0aF9vbmx5Lmxlbmd0aCA+IDApIHtcclxuICAgICAgdGhpcy5wYXRoX29ubHkgPSB0aGlzLnNldHRpbmdzLnBhdGhfb25seS5zcGxpdChcIixcIikubWFwKChwYXRoKSA9PiB7XHJcbiAgICAgICAgcmV0dXJuIHBhdGgudHJpbSgpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIC8vIGxvYWQgZmFpbGVkIGZpbGVzXHJcbiAgICBhd2FpdCB0aGlzLmxvYWRfZmFpbGVkX2ZpbGVzKCk7XHJcbiAgfVxyXG4gIGFzeW5jIHNhdmVTZXR0aW5ncyhyZXJlbmRlciA9IGZhbHNlKSB7XHJcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xyXG4gICAgLy8gcmUtbG9hZCBzZXR0aW5ncyBpbnRvIG1lbW9yeVxyXG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcclxuICAgIC8vIHJlLXJlbmRlciB2aWV3IGlmIHNldCB0byB0cnVlIChmb3IgZXhhbXBsZSwgYWZ0ZXIgYWRkaW5nIEFQSSBrZXkpXHJcbiAgICBpZiAocmVyZW5kZXIpIHtcclxuICAgICAgdGhpcy5uZWFyZXN0X2NhY2hlID0ge307XHJcbiAgICAgIGF3YWl0IHRoaXMubWFrZV9jb25uZWN0aW9ucygpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgbWFrZV9jb25uZWN0aW9ucyhzZWxlY3RlZF90ZXh0ID0gbnVsbCkge1xyXG4gICAgbGV0IHZpZXcgPSB0aGlzLmdldF92aWV3KCk7XHJcbiAgICBpZiAoIXZpZXcpIHtcclxuICAgICAgLy8gb3BlbiB2aWV3IGlmIG5vdCBvcGVuXHJcbiAgICAgIGF3YWl0IHRoaXMub3Blbl92aWV3KCk7XHJcbiAgICAgIHZpZXcgPSB0aGlzLmdldF92aWV3KCk7XHJcbiAgICB9XHJcbiAgICBhd2FpdCB2aWV3LnJlbmRlcl9jb25uZWN0aW9ucyhzZWxlY3RlZF90ZXh0KTtcclxuICB9XHJcblxyXG4gIGFkZEljb24oKSB7XHJcbiAgICBPYnNpZGlhbi5hZGRJY29uKFxyXG4gICAgICBcInNtYXJ0LWNvbm5lY3Rpb25zXCIsXHJcbiAgICAgIGA8cGF0aCBkPVwiTTUwLDIwIEw4MCw0MCBMODAsNjAgTDUwLDEwMFwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjRcIiBmaWxsPVwibm9uZVwiLz5cclxuICAgIDxwYXRoIGQ9XCJNMzAsNTAgTDU1LDcwXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiNVwiIGZpbGw9XCJub25lXCIvPlxyXG4gICAgPGNpcmNsZSBjeD1cIjUwXCIgY3k9XCIyMFwiIHI9XCI5XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5cclxuICAgIDxjaXJjbGUgY3g9XCI4MFwiIGN5PVwiNDBcIiByPVwiOVwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+XHJcbiAgICA8Y2lyY2xlIGN4PVwiODBcIiBjeT1cIjcwXCIgcj1cIjlcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPlxyXG4gICAgPGNpcmNsZSBjeD1cIjUwXCIgY3k9XCIxMDBcIiByPVwiOVwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+XHJcbiAgICA8Y2lyY2xlIGN4PVwiMzBcIiBjeT1cIjUwXCIgcj1cIjlcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPmBcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICAvLyBvcGVuIHJhbmRvbSBub3RlXHJcbiAgYXN5bmMgb3Blbl9yYW5kb21fbm90ZSgpIHtcclxuICAgIGNvbnN0IGN1cnJfZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XHJcbiAgICBjb25zdCBjdXJyX2tleSA9IG1kNShjdXJyX2ZpbGUucGF0aCk7XHJcbiAgICAvLyBpZiBubyBuZWFyZXN0IGNhY2hlLCBjcmVhdGUgT2JzaWRpYW4gbm90aWNlXHJcbiAgICBpZiAodHlwZW9mIHRoaXMubmVhcmVzdF9jYWNoZVtjdXJyX2tleV0gPT09IFwidW5kZWZpbmVkXCIpIHtcclxuICAgICAgbmV3IE9ic2lkaWFuLk5vdGljZShcclxuICAgICAgICBcIltTbWFydCBDb25uZWN0aW9uc10gTm8gU21hcnQgQ29ubmVjdGlvbnMgZm91bmQuIE9wZW4gYSBub3RlIHRvIGdldCBTbWFydCBDb25uZWN0aW9ucy5cIlxyXG4gICAgICApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICAvLyBnZXQgcmFuZG9tIGZyb20gbmVhcmVzdCBjYWNoZVxyXG4gICAgY29uc3QgcmFuZCA9IE1hdGguZmxvb3IoXHJcbiAgICAgIChNYXRoLnJhbmRvbSgpICogdGhpcy5uZWFyZXN0X2NhY2hlW2N1cnJfa2V5XS5sZW5ndGgpIC8gMlxyXG4gICAgKTsgLy8gZGl2aWRlIGJ5IDIgdG8gbGltaXQgdG8gdG9wIGhhbGYgb2YgcmVzdWx0c1xyXG4gICAgY29uc3QgcmFuZG9tX2ZpbGUgPSB0aGlzLm5lYXJlc3RfY2FjaGVbY3Vycl9rZXldW3JhbmRdO1xyXG4gICAgLy8gb3BlbiByYW5kb20gZmlsZVxyXG4gICAgdGhpcy5vcGVuX25vdGUocmFuZG9tX2ZpbGUpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgb3Blbl92aWV3KCkge1xyXG4gICAgaWYgKHRoaXMuZ2V0X3ZpZXcoKSkge1xyXG4gICAgICBjb25zb2xlLmxvZyhcIlNtYXJ0IENvbm5lY3Rpb25zIHZpZXcgYWxyZWFkeSBvcGVuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2UuZGV0YWNoTGVhdmVzT2ZUeXBlKFNNQVJUX0NPTk5FQ1RJT05TX1ZJRVdfVFlQRSk7XHJcbiAgICBhd2FpdCB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0UmlnaHRMZWFmKGZhbHNlKS5zZXRWaWV3U3RhdGUoe1xyXG4gICAgICB0eXBlOiBTTUFSVF9DT05ORUNUSU9OU19WSUVXX1RZUEUsXHJcbiAgICAgIGFjdGl2ZTogdHJ1ZSxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5hcHAud29ya3NwYWNlLnJldmVhbExlYWYoXHJcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoU01BUlRfQ09OTkVDVElPTlNfVklFV19UWVBFKVswXVxyXG4gICAgKTtcclxuICB9XHJcbiAgLy8gc291cmNlOiBodHRwczovL2dpdGh1Yi5jb20vb2JzaWRpYW5tZC9vYnNpZGlhbi1yZWxlYXNlcy9ibG9iL21hc3Rlci9wbHVnaW4tcmV2aWV3Lm1kI2F2b2lkLW1hbmFnaW5nLXJlZmVyZW5jZXMtdG8tY3VzdG9tLXZpZXdzXHJcbiAgZ2V0X3ZpZXcoKSB7XHJcbiAgICBmb3IgKGxldCBsZWFmIG9mIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXHJcbiAgICAgIFNNQVJUX0NPTk5FQ1RJT05TX1ZJRVdfVFlQRVxyXG4gICAgKSkge1xyXG4gICAgICBpZiAobGVhZi52aWV3IGluc3RhbmNlb2YgU21hcnRDb25uZWN0aW9uc1ZpZXcpIHtcclxuICAgICAgICByZXR1cm4gbGVhZi52aWV3O1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBnZXQgZW1iZWRkaW5ncyBmb3IgYWxsIGZpbGVzXHJcbiAgYXN5bmMgZ2V0X2FsbF9lbWJlZGRpbmdzKCkge1xyXG4gICAgLy8gZ2V0IGFsbCBmaWxlcyBpbiB2YXVsdCBhbmQgZmlsdGVyIGFsbCBidXQgbWFya2Rvd24gYW5kIGNhbnZhcyBmaWxlc1xyXG4gICAgY29uc3QgZmlsZXMgPSAoYXdhaXQgdGhpcy5hcHAudmF1bHQuZ2V0RmlsZXMoKSkuZmlsdGVyKFxyXG4gICAgICAoZmlsZSkgPT5cclxuICAgICAgICBmaWxlIGluc3RhbmNlb2YgT2JzaWRpYW4uVEZpbGUgJiZcclxuICAgICAgICAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiB8fCBmaWxlLmV4dGVuc2lvbiA9PT0gXCJjYW52YXNcIilcclxuICAgICk7XHJcbiAgICAvLyBjb25zdCBmaWxlcyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKTtcclxuICAgIC8vIGdldCBvcGVuIGZpbGVzIHRvIHNraXAgaWYgZmlsZSBpcyBjdXJyZW50bHkgb3BlblxyXG4gICAgY29uc3Qgb3Blbl9maWxlcyA9IHRoaXMuYXBwLndvcmtzcGFjZVxyXG4gICAgICAuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIilcclxuICAgICAgLm1hcCgobGVhZikgPT4gbGVhZi52aWV3LmZpbGUpO1xyXG4gICAgY29uc3QgY2xlYW5fdXBfbG9nID0gdGhpcy5zbWFydF92ZWNfbGl0ZS5jbGVhbl91cF9lbWJlZGRpbmdzKGZpbGVzKTtcclxuICAgIGlmICh0aGlzLnNldHRpbmdzLmxvZ19yZW5kZXIpIHtcclxuICAgICAgdGhpcy5yZW5kZXJfbG9nLnRvdGFsX2ZpbGVzID0gZmlsZXMubGVuZ3RoO1xyXG4gICAgICB0aGlzLnJlbmRlcl9sb2cuZGVsZXRlZF9lbWJlZGRpbmdzID0gY2xlYW5fdXBfbG9nLmRlbGV0ZWRfZW1iZWRkaW5ncztcclxuICAgICAgdGhpcy5yZW5kZXJfbG9nLnRvdGFsX2VtYmVkZGluZ3MgPSBjbGVhbl91cF9sb2cudG90YWxfZW1iZWRkaW5ncztcclxuICAgIH1cclxuICAgIC8vIGJhdGNoIGVtYmVkZGluZ3NcclxuICAgIGxldCBiYXRjaF9wcm9taXNlcyA9IFtdO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWxlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAvLyBza2lwIGlmIHBhdGggY29udGFpbnMgYSAjXHJcbiAgICAgIGlmIChmaWxlc1tpXS5wYXRoLmluZGV4T2YoXCIjXCIpID4gLTEpIHtcclxuICAgICAgICB0aGlzLmxvZ19leGNsdXNpb24oXCJwYXRoIGNvbnRhaW5zICNcIik7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuICAgICAgLy8gc2tpcCBpZiBmaWxlIGFscmVhZHkgaGFzIGVtYmVkZGluZyBhbmQgZW1iZWRkaW5nLm10aW1lIGlzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBmaWxlLm10aW1lXHJcbiAgICAgIGlmIChcclxuICAgICAgICB0aGlzLnNtYXJ0X3ZlY19saXRlLm10aW1lX2lzX2N1cnJlbnQoXHJcbiAgICAgICAgICBtZDUoZmlsZXNbaV0ucGF0aCksXHJcbiAgICAgICAgICBmaWxlc1tpXS5zdGF0Lm10aW1lXHJcbiAgICAgICAgKVxyXG4gICAgICApIHtcclxuICAgICAgICAvLyBsb2cgc2tpcHBpbmcgZmlsZVxyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGNoZWNrIGlmIGZpbGUgaXMgaW4gZmFpbGVkX2ZpbGVzXHJcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmZhaWxlZF9maWxlcy5pbmRleE9mKGZpbGVzW2ldLnBhdGgpID4gLTEpIHtcclxuICAgICAgICAvLyBsb2cgc2tpcHBpbmcgZmlsZVxyXG4gICAgICAgIC8vIHVzZSBzZXRUaW1lb3V0IHRvIHByZXZlbnQgbXVsdGlwbGUgbm90aWNlc1xyXG4gICAgICAgIGlmICh0aGlzLnJldHJ5X25vdGljZV90aW1lb3V0KSB7XHJcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5yZXRyeV9ub3RpY2VfdGltZW91dCk7XHJcbiAgICAgICAgICB0aGlzLnJldHJ5X25vdGljZV90aW1lb3V0ID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gbGltaXQgdG8gb25lIG5vdGljZSBldmVyeSAxMCBtaW51dGVzXHJcbiAgICAgICAgaWYgKCF0aGlzLnJlY2VudGx5X3NlbnRfcmV0cnlfbm90aWNlKSB7XHJcbiAgICAgICAgICBuZXcgT2JzaWRpYW4uTm90aWNlKFxyXG4gICAgICAgICAgICBcIlNtYXJ0IENvbm5lY3Rpb25zOiBTa2lwcGluZyBwcmV2aW91c2x5IGZhaWxlZCBmaWxlLCB1c2UgYnV0dG9uIGluIHNldHRpbmdzIHRvIHJldHJ5XCJcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgICB0aGlzLnJlY2VudGx5X3NlbnRfcmV0cnlfbm90aWNlID0gdHJ1ZTtcclxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnJlY2VudGx5X3NlbnRfcmV0cnlfbm90aWNlID0gZmFsc2U7XHJcbiAgICAgICAgICB9LCA2MDAwMDApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICAvLyBza2lwIGZpbGVzIHdoZXJlIHBhdGggY29udGFpbnMgYW55IGV4Y2x1c2lvbnNcclxuICAgICAgbGV0IHNraXAgPSBmYWxzZTtcclxuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCB0aGlzLmZpbGVfZXhjbHVzaW9ucy5sZW5ndGg7IGorKykge1xyXG4gICAgICAgIGlmIChmaWxlc1tpXS5wYXRoLmluZGV4T2YodGhpcy5maWxlX2V4Y2x1c2lvbnNbal0pID4gLTEpIHtcclxuICAgICAgICAgIHNraXAgPSB0cnVlO1xyXG4gICAgICAgICAgdGhpcy5sb2dfZXhjbHVzaW9uKHRoaXMuZmlsZV9leGNsdXNpb25zW2pdKTtcclxuICAgICAgICAgIC8vIGJyZWFrIG91dCBvZiBsb29wXHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHNraXApIHtcclxuICAgICAgICBjb250aW51ZTsgLy8gdG8gbmV4dCBmaWxlXHJcbiAgICAgIH1cclxuICAgICAgLy8gY2hlY2sgaWYgZmlsZSBpcyBvcGVuXHJcbiAgICAgIGlmIChvcGVuX2ZpbGVzLmluZGV4T2YoZmlsZXNbaV0pID4gLTEpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIC8vIHB1c2ggcHJvbWlzZSB0byBiYXRjaF9wcm9taXNlc1xyXG4gICAgICAgIGJhdGNoX3Byb21pc2VzLnB1c2godGhpcy5nZXRfZmlsZV9lbWJlZGRpbmdzKGZpbGVzW2ldLCBmYWxzZSkpO1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGVycm9yKTtcclxuICAgICAgfVxyXG4gICAgICAvLyBpZiBiYXRjaF9wcm9taXNlcyBsZW5ndGggaXMgMTBcclxuICAgICAgaWYgKGJhdGNoX3Byb21pc2VzLmxlbmd0aCA+IDMpIHtcclxuICAgICAgICAvLyB3YWl0IGZvciBhbGwgcHJvbWlzZXMgdG8gcmVzb2x2ZVxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKGJhdGNoX3Byb21pc2VzKTtcclxuICAgICAgICAvLyBjbGVhciBiYXRjaF9wcm9taXNlc1xyXG4gICAgICAgIGJhdGNoX3Byb21pc2VzID0gW107XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIHNhdmUgZW1iZWRkaW5ncyBKU09OIHRvIGZpbGUgZXZlcnkgMTAwIGZpbGVzIHRvIHNhdmUgcHJvZ3Jlc3Mgb24gYnVsayBlbWJlZGRpbmdcclxuICAgICAgaWYgKGkgPiAwICYmIGkgJSAxMDAgPT09IDApIHtcclxuICAgICAgICBhd2FpdCB0aGlzLnNhdmVfZW1iZWRkaW5nc190b19maWxlKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIHdhaXQgZm9yIGFsbCBwcm9taXNlcyB0byByZXNvbHZlXHJcbiAgICBhd2FpdCBQcm9taXNlLmFsbChiYXRjaF9wcm9taXNlcyk7XHJcbiAgICAvLyB3cml0ZSBlbWJlZGRpbmdzIEpTT04gdG8gZmlsZVxyXG4gICAgYXdhaXQgdGhpcy5zYXZlX2VtYmVkZGluZ3NfdG9fZmlsZSgpO1xyXG4gICAgLy8gaWYgcmVuZGVyX2xvZy5mYWlsZWRfZW1iZWRkaW5ncyB0aGVuIHVwZGF0ZSBmYWlsZWRfZW1iZWRkaW5ncy50eHRcclxuICAgIGlmICh0aGlzLnJlbmRlcl9sb2cuZmFpbGVkX2VtYmVkZGluZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgICBhd2FpdCB0aGlzLnNhdmVfZmFpbGVkX2VtYmVkZGluZ3MoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIHNhdmVfZW1iZWRkaW5nc190b19maWxlKGZvcmNlID0gZmFsc2UpIHtcclxuICAgIGlmICghdGhpcy5oYXNfbmV3X2VtYmVkZGluZ3MpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKCFmb3JjZSkge1xyXG4gICAgICAvLyBwcmV2ZW50IGV4Y2Vzc2l2ZSB3cml0ZXMgdG8gZW1iZWRkaW5ncyBmaWxlIGJ5IHdhaXRpbmcgMSBtaW51dGUgYmVmb3JlIHdyaXRpbmdcclxuICAgICAgaWYgKHRoaXMuc2F2ZV90aW1lb3V0KSB7XHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuc2F2ZV90aW1lb3V0KTtcclxuICAgICAgICB0aGlzLnNhdmVfdGltZW91dCA9IG51bGw7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5zYXZlX3RpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICB0aGlzLnNhdmVfZW1iZWRkaW5nc190b19maWxlKHRydWUpO1xyXG4gICAgICAgIC8vIGNsZWFyIHRpbWVvdXRcclxuICAgICAgICBpZiAodGhpcy5zYXZlX3RpbWVvdXQpIHtcclxuICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnNhdmVfdGltZW91dCk7XHJcbiAgICAgICAgICB0aGlzLnNhdmVfdGltZW91dCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LCAzMDAwMCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKFwic2NoZWR1bGVkIHNhdmVcIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyB1c2Ugc21hcnRfdmVjX2xpdGVcclxuICAgICAgYXdhaXQgdGhpcy5zbWFydF92ZWNfbGl0ZS5zYXZlKCk7XHJcbiAgICAgIHRoaXMuaGFzX25ld19lbWJlZGRpbmdzID0gZmFsc2U7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmxvZyhlcnJvcik7XHJcbiAgICAgIG5ldyBPYnNpZGlhbi5Ob3RpY2UoXCJTbWFydCBDb25uZWN0aW9uczogXCIgKyBlcnJvci5tZXNzYWdlKTtcclxuICAgIH1cclxuICB9XHJcbiAgLy8gc2F2ZSBmYWlsZWQgZW1iZWRkaW5ncyB0byBmaWxlIGZyb20gcmVuZGVyX2xvZy5mYWlsZWRfZW1iZWRkaW5nc1xyXG4gIGFzeW5jIHNhdmVfZmFpbGVkX2VtYmVkZGluZ3MoKSB7XHJcbiAgICAvLyB3cml0ZSBmYWlsZWRfZW1iZWRkaW5ncyB0byBmaWxlIG9uZSBsaW5lIHBlciBmYWlsZWQgZW1iZWRkaW5nXHJcbiAgICBsZXQgZmFpbGVkX2VtYmVkZGluZ3MgPSBbXTtcclxuICAgIC8vIGlmIGZpbGUgYWxyZWFkeSBleGlzdHMgdGhlbiByZWFkIGl0XHJcbiAgICBjb25zdCBmYWlsZWRfZW1iZWRkaW5nc19maWxlX2V4aXN0cyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZXhpc3RzKFxyXG4gICAgICBcIi5zbWFydC1jb25uZWN0aW9ucy9mYWlsZWQtZW1iZWRkaW5ncy50eHRcIlxyXG4gICAgKTtcclxuICAgIGlmIChmYWlsZWRfZW1iZWRkaW5nc19maWxlX2V4aXN0cykge1xyXG4gICAgICBmYWlsZWRfZW1iZWRkaW5ncyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZChcclxuICAgICAgICBcIi5zbWFydC1jb25uZWN0aW9ucy9mYWlsZWQtZW1iZWRkaW5ncy50eHRcIlxyXG4gICAgICApO1xyXG4gICAgICAvLyBzcGxpdCBmYWlsZWRfZW1iZWRkaW5ncyBpbnRvIGFycmF5XHJcbiAgICAgIGZhaWxlZF9lbWJlZGRpbmdzID0gZmFpbGVkX2VtYmVkZGluZ3Muc3BsaXQoXCJcXHJcXG5cIik7XHJcbiAgICB9XHJcbiAgICAvLyBtZXJnZSBmYWlsZWRfZW1iZWRkaW5ncyB3aXRoIHJlbmRlcl9sb2cuZmFpbGVkX2VtYmVkZGluZ3NcclxuICAgIGZhaWxlZF9lbWJlZGRpbmdzID0gZmFpbGVkX2VtYmVkZGluZ3MuY29uY2F0KFxyXG4gICAgICB0aGlzLnJlbmRlcl9sb2cuZmFpbGVkX2VtYmVkZGluZ3NcclxuICAgICk7XHJcbiAgICAvLyByZW1vdmUgZHVwbGljYXRlc1xyXG4gICAgZmFpbGVkX2VtYmVkZGluZ3MgPSBbLi4ubmV3IFNldChmYWlsZWRfZW1iZWRkaW5ncyldO1xyXG4gICAgLy8gc29ydCBmYWlsZWRfZW1iZWRkaW5ncyBhcnJheSBhbHBoYWJldGljYWxseVxyXG4gICAgZmFpbGVkX2VtYmVkZGluZ3Muc29ydCgpO1xyXG4gICAgLy8gY29udmVydCBmYWlsZWRfZW1iZWRkaW5ncyBhcnJheSB0byBzdHJpbmdcclxuICAgIGZhaWxlZF9lbWJlZGRpbmdzID0gZmFpbGVkX2VtYmVkZGluZ3Muam9pbihcIlxcclxcblwiKTtcclxuICAgIC8vIHdyaXRlIGZhaWxlZF9lbWJlZGRpbmdzIHRvIGZpbGVcclxuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIud3JpdGUoXHJcbiAgICAgIFwiLnNtYXJ0LWNvbm5lY3Rpb25zL2ZhaWxlZC1lbWJlZGRpbmdzLnR4dFwiLFxyXG4gICAgICBmYWlsZWRfZW1iZWRkaW5nc1xyXG4gICAgKTtcclxuICAgIC8vIHJlbG9hZCBmYWlsZWRfZW1iZWRkaW5ncyB0byBwcmV2ZW50IHJldHJ5aW5nIGZhaWxlZCBmaWxlcyB1bnRpbCBleHBsaWNpdGx5IHJlcXVlc3RlZFxyXG4gICAgYXdhaXQgdGhpcy5sb2FkX2ZhaWxlZF9maWxlcygpO1xyXG4gIH1cclxuXHJcbiAgLy8gbG9hZCBmYWlsZWQgZmlsZXMgZnJvbSBmYWlsZWQtZW1iZWRkaW5ncy50eHRcclxuICBhc3luYyBsb2FkX2ZhaWxlZF9maWxlcygpIHtcclxuICAgIC8vIGNoZWNrIGlmIGZhaWxlZC1lbWJlZGRpbmdzLnR4dCBleGlzdHNcclxuICAgIGNvbnN0IGZhaWxlZF9lbWJlZGRpbmdzX2ZpbGVfZXhpc3RzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMoXHJcbiAgICAgIFwiLnNtYXJ0LWNvbm5lY3Rpb25zL2ZhaWxlZC1lbWJlZGRpbmdzLnR4dFwiXHJcbiAgICApO1xyXG4gICAgaWYgKCFmYWlsZWRfZW1iZWRkaW5nc19maWxlX2V4aXN0cykge1xyXG4gICAgICB0aGlzLnNldHRpbmdzLmZhaWxlZF9maWxlcyA9IFtdO1xyXG4gICAgICBjb25zb2xlLmxvZyhcIk5vIGZhaWxlZCBmaWxlcy5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIC8vIHJlYWQgZmFpbGVkLWVtYmVkZGluZ3MudHh0XHJcbiAgICBjb25zdCBmYWlsZWRfZW1iZWRkaW5ncyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZChcclxuICAgICAgXCIuc21hcnQtY29ubmVjdGlvbnMvZmFpbGVkLWVtYmVkZGluZ3MudHh0XCJcclxuICAgICk7XHJcbiAgICAvLyBzcGxpdCBmYWlsZWRfZW1iZWRkaW5ncyBpbnRvIGFycmF5IGFuZCByZW1vdmUgZW1wdHkgbGluZXNcclxuICAgIGNvbnN0IGZhaWxlZF9lbWJlZGRpbmdzX2FycmF5ID0gZmFpbGVkX2VtYmVkZGluZ3Muc3BsaXQoXCJcXHJcXG5cIik7XHJcbiAgICAvLyBzcGxpdCBhdCAnIycgYW5kIHJlZHVjZSBpbnRvIHVuaXF1ZSBmaWxlIHBhdGhzXHJcbiAgICBjb25zdCBmYWlsZWRfZmlsZXMgPSBmYWlsZWRfZW1iZWRkaW5nc19hcnJheVxyXG4gICAgICAubWFwKChlbWJlZGRpbmcpID0+IGVtYmVkZGluZy5zcGxpdChcIiNcIilbMF0pXHJcbiAgICAgIC5yZWR1Y2UoXHJcbiAgICAgICAgKHVuaXF1ZSwgaXRlbSkgPT4gKHVuaXF1ZS5pbmNsdWRlcyhpdGVtKSA/IHVuaXF1ZSA6IFsuLi51bmlxdWUsIGl0ZW1dKSxcclxuICAgICAgICBbXVxyXG4gICAgICApO1xyXG4gICAgLy8gcmV0dXJuIGZhaWxlZF9maWxlc1xyXG4gICAgdGhpcy5zZXR0aW5ncy5mYWlsZWRfZmlsZXMgPSBmYWlsZWRfZmlsZXM7XHJcbiAgfVxyXG4gIC8vIHJldHJ5IGZhaWxlZCBlbWJlZGRpbmdzXHJcbiAgYXN5bmMgcmV0cnlfZmFpbGVkX2ZpbGVzKCkge1xyXG4gICAgLy8gcmVtb3ZlIGZhaWxlZCBmaWxlcyBmcm9tIGZhaWxlZF9maWxlc1xyXG4gICAgdGhpcy5zZXR0aW5ncy5mYWlsZWRfZmlsZXMgPSBbXTtcclxuICAgIC8vIGlmIGZhaWxlZC1lbWJlZGRpbmdzLnR4dCBleGlzdHMgdGhlbiBkZWxldGUgaXRcclxuICAgIGNvbnN0IGZhaWxlZF9lbWJlZGRpbmdzX2ZpbGVfZXhpc3RzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMoXHJcbiAgICAgIFwiLnNtYXJ0LWNvbm5lY3Rpb25zL2ZhaWxlZC1lbWJlZGRpbmdzLnR4dFwiXHJcbiAgICApO1xyXG4gICAgaWYgKGZhaWxlZF9lbWJlZGRpbmdzX2ZpbGVfZXhpc3RzKSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVtb3ZlKFxyXG4gICAgICAgIFwiLnNtYXJ0LWNvbm5lY3Rpb25zL2ZhaWxlZC1lbWJlZGRpbmdzLnR4dFwiXHJcbiAgICAgICk7XHJcbiAgICB9XHJcbiAgICAvLyBydW4gZ2V0IGFsbCBlbWJlZGRpbmdzXHJcbiAgICBhd2FpdCB0aGlzLmdldF9hbGxfZW1iZWRkaW5ncygpO1xyXG4gIH1cclxuXHJcbiAgLy8gYWRkIC5zbWFydC1jb25uZWN0aW9ucyB0byAuZ2l0aWdub3JlIHRvIHByZXZlbnQgaXNzdWVzIHdpdGggbGFyZ2UsIGZyZXF1ZW50bHkgdXBkYXRlZCBlbWJlZGRpbmdzIGZpbGUocylcclxuICBhc3luYyBhZGRfdG9fZ2l0aWdub3JlKCkge1xyXG4gICAgaWYgKCEoYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMoXCIuZ2l0aWdub3JlXCIpKSkge1xyXG4gICAgICByZXR1cm47IC8vIGlmIC5naXRpZ25vcmUgZG9lc24ndCBleGlzdCB0aGVuIGRvbid0IGFkZCAuc21hcnQtY29ubmVjdGlvbnMgdG8gLmdpdGlnbm9yZVxyXG4gICAgfVxyXG4gICAgbGV0IGdpdGlnbm9yZV9maWxlID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5yZWFkKFwiLmdpdGlnbm9yZVwiKTtcclxuICAgIC8vIGlmIC5zbWFydC1jb25uZWN0aW9ucyBub3QgaW4gLmdpdGlnbm9yZVxyXG4gICAgaWYgKGdpdGlnbm9yZV9maWxlLmluZGV4T2YoXCIuc21hcnQtY29ubmVjdGlvbnNcIikgPCAwKSB7XHJcbiAgICAgIC8vIGFkZCAuc21hcnQtY29ubmVjdGlvbnMgdG8gLmdpdGlnbm9yZVxyXG4gICAgICBsZXQgYWRkX3RvX2dpdGlnbm9yZSA9XHJcbiAgICAgICAgXCJcXG5cXG4jIElnbm9yZSBTbWFydCBDb25uZWN0aW9ucyBmb2xkZXIgYmVjYXVzZSBlbWJlZGRpbmdzIGZpbGUgaXMgbGFyZ2UgYW5kIHVwZGF0ZWQgZnJlcXVlbnRseVwiO1xyXG4gICAgICBhZGRfdG9fZ2l0aWdub3JlICs9IFwiXFxuLnNtYXJ0LWNvbm5lY3Rpb25zXCI7XHJcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIud3JpdGUoXHJcbiAgICAgICAgXCIuZ2l0aWdub3JlXCIsXHJcbiAgICAgICAgZ2l0aWdub3JlX2ZpbGUgKyBhZGRfdG9fZ2l0aWdub3JlXHJcbiAgICAgICk7XHJcbiAgICAgIGNvbnNvbGUubG9nKFwiYWRkZWQgLnNtYXJ0LWNvbm5lY3Rpb25zIHRvIC5naXRpZ25vcmVcIik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBmb3JjZSByZWZyZXNoIGVtYmVkZGluZ3MgZmlsZSBidXQgZmlyc3QgcmVuYW1lIGV4aXN0aW5nIGVtYmVkZGluZ3MgZmlsZSB0byAuc21hcnQtY29ubmVjdGlvbnMvZW1iZWRkaW5ncy1ZWVlZLU1NLURELmpzb25cclxuICBhc3luYyBmb3JjZV9yZWZyZXNoX2VtYmVkZGluZ3NfZmlsZSgpIHtcclxuICAgIG5ldyBPYnNpZGlhbi5Ob3RpY2UoXHJcbiAgICAgIFwiU21hcnQgQ29ubmVjdGlvbnM6IGVtYmVkZGluZ3MgZmlsZSBGb3JjZSBSZWZyZXNoZWQsIG1ha2luZyBuZXcgY29ubmVjdGlvbnMuLi5cIlxyXG4gICAgKTtcclxuICAgIC8vIGZvcmNlIHJlZnJlc2hcclxuICAgIGF3YWl0IHRoaXMuc21hcnRfdmVjX2xpdGUuZm9yY2VfcmVmcmVzaCgpO1xyXG4gICAgLy8gdHJpZ2dlciBtYWtpbmcgbmV3IGNvbm5lY3Rpb25zXHJcbiAgICBhd2FpdCB0aGlzLmdldF9hbGxfZW1iZWRkaW5ncygpO1xyXG4gICAgdGhpcy5vdXRwdXRfcmVuZGVyX2xvZygpO1xyXG4gICAgbmV3IE9ic2lkaWFuLk5vdGljZShcclxuICAgICAgXCJTbWFydCBDb25uZWN0aW9uczogZW1iZWRkaW5ncyBmaWxlIEZvcmNlIFJlZnJlc2hlZCwgbmV3IGNvbm5lY3Rpb25zIG1hZGUuXCJcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICAvLyBnZXQgZW1iZWRkaW5ncyBmb3IgZW1iZWRfaW5wdXRcclxuICBhc3luYyBnZXRfZmlsZV9lbWJlZGRpbmdzKGN1cnJfZmlsZSwgc2F2ZSA9IHRydWUpIHtcclxuICAgIC8vIGxldCBiYXRjaF9wcm9taXNlcyA9IFtdO1xyXG4gICAgbGV0IHJlcV9iYXRjaCA9IFtdO1xyXG4gICAgbGV0IGJsb2NrcyA9IFtdO1xyXG4gICAgLy8gaW5pdGlhdGUgY3Vycl9maWxlX2tleSBmcm9tIG1kNShjdXJyX2ZpbGUucGF0aClcclxuICAgIGNvbnN0IGN1cnJfZmlsZV9rZXkgPSBtZDUoY3Vycl9maWxlLnBhdGgpO1xyXG4gICAgLy8gaW50aWF0ZSBmaWxlX2ZpbGVfZW1iZWRfaW5wdXQgYnkgcmVtb3ZpbmcgLm1kIGFuZCBjb252ZXJ0aW5nIGZpbGUgcGF0aCB0byBicmVhZGNydW1icyAoXCIgPiBcIilcclxuICAgIGxldCBmaWxlX2VtYmVkX2lucHV0ID0gY3Vycl9maWxlLnBhdGgucmVwbGFjZShcIi5tZFwiLCBcIlwiKTtcclxuICAgIGZpbGVfZW1iZWRfaW5wdXQgPSBmaWxlX2VtYmVkX2lucHV0LnJlcGxhY2UoL1xcLy9nLCBcIiA+IFwiKTtcclxuICAgIC8vIGVtYmVkIG9uIGZpbGUubmFtZS90aXRsZSBvbmx5IGlmIHBhdGhfb25seSBwYXRoIG1hdGNoZXIgc3BlY2lmaWVkIGluIHNldHRpbmdzXHJcbiAgICBsZXQgcGF0aF9vbmx5ID0gZmFsc2U7XHJcbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMucGF0aF9vbmx5Lmxlbmd0aDsgaisrKSB7XHJcbiAgICAgIGlmIChjdXJyX2ZpbGUucGF0aC5pbmRleE9mKHRoaXMucGF0aF9vbmx5W2pdKSA+IC0xKSB7XHJcbiAgICAgICAgcGF0aF9vbmx5ID0gdHJ1ZTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcInRpdGxlIG9ubHkgZmlsZSB3aXRoIG1hdGNoZXI6IFwiICsgdGhpcy5wYXRoX29ubHlbal0pO1xyXG4gICAgICAgIC8vIGJyZWFrIG91dCBvZiBsb29wXHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIHJldHVybiBlYXJseSBpZiBwYXRoX29ubHlcclxuICAgIGlmIChwYXRoX29ubHkpIHtcclxuICAgICAgcmVxX2JhdGNoLnB1c2goW1xyXG4gICAgICAgIGN1cnJfZmlsZV9rZXksXHJcbiAgICAgICAgZmlsZV9lbWJlZF9pbnB1dCxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBtdGltZTogY3Vycl9maWxlLnN0YXQubXRpbWUsXHJcbiAgICAgICAgICBwYXRoOiBjdXJyX2ZpbGUucGF0aCxcclxuICAgICAgICB9LFxyXG4gICAgICBdKTtcclxuICAgICAgYXdhaXQgdGhpcy5nZXRfZW1iZWRkaW5nc19iYXRjaChyZXFfYmF0Y2gpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICAvKipcclxuICAgICAqIEJFR0lOIENhbnZhcyBmaWxlIHR5cGUgRW1iZWRkaW5nXHJcbiAgICAgKi9cclxuICAgIGlmIChjdXJyX2ZpbGUuZXh0ZW5zaW9uID09PSBcImNhbnZhc1wiKSB7XHJcbiAgICAgIC8vIGdldCBmaWxlIGNvbnRlbnRzIGFuZCBwYXJzZSBhcyBKU09OXHJcbiAgICAgIGNvbnN0IGNhbnZhc19jb250ZW50cyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoY3Vycl9maWxlKTtcclxuICAgICAgaWYgKFxyXG4gICAgICAgIHR5cGVvZiBjYW52YXNfY29udGVudHMgPT09IFwic3RyaW5nXCIgJiZcclxuICAgICAgICBjYW52YXNfY29udGVudHMuaW5kZXhPZihcIm5vZGVzXCIpID4gLTFcclxuICAgICAgKSB7XHJcbiAgICAgICAgY29uc3QgY2FudmFzX2pzb24gPSBKU09OLnBhcnNlKGNhbnZhc19jb250ZW50cyk7XHJcbiAgICAgICAgLy8gZm9yIGVhY2ggb2JqZWN0IGluIG5vZGVzIGFycmF5XHJcbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBjYW52YXNfanNvbi5ub2Rlcy5sZW5ndGg7IGorKykge1xyXG4gICAgICAgICAgLy8gaWYgb2JqZWN0IGhhcyB0ZXh0IHByb3BlcnR5XHJcbiAgICAgICAgICBpZiAoY2FudmFzX2pzb24ubm9kZXNbal0udGV4dCkge1xyXG4gICAgICAgICAgICAvLyBhZGQgdG8gZmlsZV9lbWJlZF9pbnB1dFxyXG4gICAgICAgICAgICBmaWxlX2VtYmVkX2lucHV0ICs9IFwiXFxuXCIgKyBjYW52YXNfanNvbi5ub2Rlc1tqXS50ZXh0O1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgLy8gaWYgb2JqZWN0IGhhcyBmaWxlIHByb3BlcnR5XHJcbiAgICAgICAgICBpZiAoY2FudmFzX2pzb24ubm9kZXNbal0uZmlsZSkge1xyXG4gICAgICAgICAgICAvLyBhZGQgdG8gZmlsZV9lbWJlZF9pbnB1dFxyXG4gICAgICAgICAgICBmaWxlX2VtYmVkX2lucHV0ICs9IFwiXFxuTGluazogXCIgKyBjYW52YXNfanNvbi5ub2Rlc1tqXS5maWxlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICByZXFfYmF0Y2gucHVzaChbXHJcbiAgICAgICAgY3Vycl9maWxlX2tleSxcclxuICAgICAgICBmaWxlX2VtYmVkX2lucHV0LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIG10aW1lOiBjdXJyX2ZpbGUuc3RhdC5tdGltZSxcclxuICAgICAgICAgIHBhdGg6IGN1cnJfZmlsZS5wYXRoLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0pO1xyXG4gICAgICBhd2FpdCB0aGlzLmdldF9lbWJlZGRpbmdzX2JhdGNoKHJlcV9iYXRjaCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJFR0lOIEJsb2NrIFwic2VjdGlvblwiIGVtYmVkZGluZ1xyXG4gICAgICovXHJcbiAgICAvLyBnZXQgZmlsZSBjb250ZW50c1xyXG4gICAgY29uc3Qgbm90ZV9jb250ZW50cyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoY3Vycl9maWxlKTtcclxuICAgIGxldCBwcm9jZXNzZWRfc2luY2VfbGFzdF9zYXZlID0gMDtcclxuICAgIGNvbnN0IG5vdGVfc2VjdGlvbnMgPSB0aGlzLmJsb2NrX3BhcnNlcihub3RlX2NvbnRlbnRzLCBjdXJyX2ZpbGUucGF0aCk7XHJcbiAgICAvLyBpZiBub3RlIGhhcyBtb3JlIHRoYW4gb25lIHNlY3Rpb24gKGlmIG9ubHkgb25lIHRoZW4gaXRzIHNhbWUgYXMgZnVsbC1jb250ZW50KVxyXG4gICAgaWYgKG5vdGVfc2VjdGlvbnMubGVuZ3RoID4gMSkge1xyXG4gICAgICAvLyBmb3IgZWFjaCBzZWN0aW9uIGluIGZpbGVcclxuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBub3RlX3NlY3Rpb25zLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgLy8gZ2V0IGVtYmVkX2lucHV0IGZvciBibG9ja1xyXG4gICAgICAgIGNvbnN0IGJsb2NrX2VtYmVkX2lucHV0ID0gbm90ZV9zZWN0aW9uc1tqXS50ZXh0O1xyXG4gICAgICAgIC8vIGdldCBibG9jayBrZXkgZnJvbSBibG9jay5wYXRoIChjb250YWlucyBib3RoIGZpbGUucGF0aCBhbmQgaGVhZGVyIHBhdGgpXHJcbiAgICAgICAgY29uc3QgYmxvY2tfa2V5ID0gbWQ1KG5vdGVfc2VjdGlvbnNbal0ucGF0aCk7XHJcbiAgICAgICAgYmxvY2tzLnB1c2goYmxvY2tfa2V5KTtcclxuICAgICAgICAvLyBza2lwIGlmIGxlbmd0aCBvZiBibG9ja19lbWJlZF9pbnB1dCBzYW1lIGFzIGxlbmd0aCBvZiBlbWJlZGRpbmdzW2Jsb2NrX2tleV0ubWV0YS5zaXplXHJcbiAgICAgICAgLy8gVE9ETyBjb25zaWRlciByb3VuZGluZyB0byBuZWFyZXN0IDEwIG9yIDEwMCBmb3IgZnV6enkgbWF0Y2hpbmdcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICB0aGlzLnNtYXJ0X3ZlY19saXRlLmdldF9zaXplKGJsb2NrX2tleSkgPT09IGJsb2NrX2VtYmVkX2lucHV0Lmxlbmd0aFxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgLy8gbG9nIHNraXBwaW5nIGZpbGVcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBhZGQgaGFzaCB0byBibG9ja3MgdG8gcHJldmVudCBlbXB0eSBibG9ja3MgdHJpZ2dlcmluZyBmdWxsLWZpbGUgZW1iZWRkaW5nXHJcbiAgICAgICAgLy8gc2tpcCBpZiBlbWJlZGRpbmdzIGtleSBhbHJlYWR5IGV4aXN0cyBhbmQgYmxvY2sgbXRpbWUgaXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGZpbGUgbXRpbWVcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICB0aGlzLnNtYXJ0X3ZlY19saXRlLm10aW1lX2lzX2N1cnJlbnQoYmxvY2tfa2V5LCBjdXJyX2ZpbGUuc3RhdC5tdGltZSlcclxuICAgICAgICApIHtcclxuICAgICAgICAgIC8vIGxvZyBza2lwcGluZyBmaWxlXHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gc2tpcCBpZiBoYXNoIGlzIHByZXNlbnQgaW4gZW1iZWRkaW5ncyBhbmQgaGFzaCBvZiBibG9ja19lbWJlZF9pbnB1dCBpcyBlcXVhbCB0byBoYXNoIGluIGVtYmVkZGluZ3NcclxuICAgICAgICBjb25zdCBibG9ja19oYXNoID0gbWQ1KGJsb2NrX2VtYmVkX2lucHV0LnRyaW0oKSk7XHJcbiAgICAgICAgaWYgKHRoaXMuc21hcnRfdmVjX2xpdGUuZ2V0X2hhc2goYmxvY2tfa2V5KSA9PT0gYmxvY2tfaGFzaCkge1xyXG4gICAgICAgICAgLy8gbG9nIHNraXBwaW5nIGZpbGVcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gY3JlYXRlIHJlcV9iYXRjaCBmb3IgYmF0Y2hpbmcgcmVxdWVzdHNcclxuICAgICAgICByZXFfYmF0Y2gucHVzaChbXHJcbiAgICAgICAgICBibG9ja19rZXksXHJcbiAgICAgICAgICBibG9ja19lbWJlZF9pbnB1dCxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgLy8gb2xkbXRpbWU6IGN1cnJfZmlsZS5zdGF0Lm10aW1lLFxyXG4gICAgICAgICAgICAvLyBnZXQgY3VycmVudCBkYXRldGltZSBhcyB1bml4IHRpbWVzdGFtcFxyXG4gICAgICAgICAgICBtdGltZTogRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgaGFzaDogYmxvY2tfaGFzaCxcclxuICAgICAgICAgICAgcGFyZW50OiBjdXJyX2ZpbGVfa2V5LFxyXG4gICAgICAgICAgICBwYXRoOiBub3RlX3NlY3Rpb25zW2pdLnBhdGgsXHJcbiAgICAgICAgICAgIHNpemU6IGJsb2NrX2VtYmVkX2lucHV0Lmxlbmd0aCxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSk7XHJcbiAgICAgICAgaWYgKHJlcV9iYXRjaC5sZW5ndGggPiA5KSB7XHJcbiAgICAgICAgICAvLyBhZGQgYmF0Y2ggdG8gYmF0Y2hfcHJvbWlzZXNcclxuICAgICAgICAgIGF3YWl0IHRoaXMuZ2V0X2VtYmVkZGluZ3NfYmF0Y2gocmVxX2JhdGNoKTtcclxuICAgICAgICAgIHByb2Nlc3NlZF9zaW5jZV9sYXN0X3NhdmUgKz0gcmVxX2JhdGNoLmxlbmd0aDtcclxuICAgICAgICAgIC8vIGxvZyBlbWJlZGRpbmdcclxuICAgICAgICAgIGlmIChwcm9jZXNzZWRfc2luY2VfbGFzdF9zYXZlID49IDMwKSB7XHJcbiAgICAgICAgICAgIC8vIHdyaXRlIGVtYmVkZGluZ3MgSlNPTiB0byBmaWxlXHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZV9lbWJlZGRpbmdzX3RvX2ZpbGUoKTtcclxuICAgICAgICAgICAgLy8gcmVzZXQgcHJvY2Vzc2VkX3NpbmNlX2xhc3Rfc2F2ZVxyXG4gICAgICAgICAgICBwcm9jZXNzZWRfc2luY2VfbGFzdF9zYXZlID0gMDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIC8vIHJlc2V0IHJlcV9iYXRjaFxyXG4gICAgICAgICAgcmVxX2JhdGNoID0gW107XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICAvLyBpZiByZXFfYmF0Y2ggaXMgbm90IGVtcHR5XHJcbiAgICBpZiAocmVxX2JhdGNoLmxlbmd0aCA+IDApIHtcclxuICAgICAgLy8gcHJvY2VzcyByZW1haW5pbmcgcmVxX2JhdGNoXHJcbiAgICAgIGF3YWl0IHRoaXMuZ2V0X2VtYmVkZGluZ3NfYmF0Y2gocmVxX2JhdGNoKTtcclxuICAgICAgcmVxX2JhdGNoID0gW107XHJcbiAgICAgIHByb2Nlc3NlZF9zaW5jZV9sYXN0X3NhdmUgKz0gcmVxX2JhdGNoLmxlbmd0aDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJFR0lOIEZpbGUgXCJmdWxsIG5vdGVcIiBlbWJlZGRpbmdcclxuICAgICAqL1xyXG5cclxuICAgIC8vIGlmIGZpbGUgbGVuZ3RoIGlzIGxlc3MgdGhhbiB+ODAwMCB0b2tlbnMgdXNlIGZ1bGwgZmlsZSBjb250ZW50c1xyXG4gICAgLy8gZWxzZSBpZiBmaWxlIGxlbmd0aCBpcyBncmVhdGVyIHRoYW4gODAwMCB0b2tlbnMgYnVpbGQgZmlsZV9lbWJlZF9pbnB1dCBmcm9tIGZpbGUgaGVhZGluZ3NcclxuICAgIGZpbGVfZW1iZWRfaW5wdXQgKz0gYDpcXG5gO1xyXG4gICAgLyoqXHJcbiAgICAgKiBUT0RPOiBpbXByb3ZlL3JlZmFjdG9yIHRoZSBmb2xsb3dpbmcgXCJsYXJnZSBmaWxlIHJlZHVjZSB0byBoZWFkaW5nc1wiIGxvZ2ljXHJcbiAgICAgKi9cclxuICAgIGlmIChub3RlX2NvbnRlbnRzLmxlbmd0aCA8IE1BWF9FTUJFRF9TVFJJTkdfTEVOR1RIKSB7XHJcbiAgICAgIGZpbGVfZW1iZWRfaW5wdXQgKz0gbm90ZV9jb250ZW50cztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnN0IG5vdGVfbWV0YV9jYWNoZSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGN1cnJfZmlsZSk7XHJcbiAgICAgIC8vIGZvciBlYWNoIGhlYWRpbmcgaW4gZmlsZVxyXG4gICAgICBpZiAodHlwZW9mIG5vdGVfbWV0YV9jYWNoZS5oZWFkaW5ncyA9PT0gXCJ1bmRlZmluZWRcIikge1xyXG4gICAgICAgIGZpbGVfZW1iZWRfaW5wdXQgKz0gbm90ZV9jb250ZW50cy5zdWJzdHJpbmcoMCwgTUFYX0VNQkVEX1NUUklOR19MRU5HVEgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxldCBub3RlX2hlYWRpbmdzID0gXCJcIjtcclxuICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG5vdGVfbWV0YV9jYWNoZS5oZWFkaW5ncy5sZW5ndGg7IGorKykge1xyXG4gICAgICAgICAgLy8gZ2V0IGhlYWRpbmcgbGV2ZWxcclxuICAgICAgICAgIGNvbnN0IGhlYWRpbmdfbGV2ZWwgPSBub3RlX21ldGFfY2FjaGUuaGVhZGluZ3Nbal0ubGV2ZWw7XHJcbiAgICAgICAgICAvLyBnZXQgaGVhZGluZyB0ZXh0XHJcbiAgICAgICAgICBjb25zdCBoZWFkaW5nX3RleHQgPSBub3RlX21ldGFfY2FjaGUuaGVhZGluZ3Nbal0uaGVhZGluZztcclxuICAgICAgICAgIC8vIGJ1aWxkIG1hcmtkb3duIGhlYWRpbmdcclxuICAgICAgICAgIGxldCBtZF9oZWFkaW5nID0gXCJcIjtcclxuICAgICAgICAgIGZvciAobGV0IGsgPSAwOyBrIDwgaGVhZGluZ19sZXZlbDsgaysrKSB7XHJcbiAgICAgICAgICAgIG1kX2hlYWRpbmcgKz0gXCIjXCI7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAvLyBhZGQgaGVhZGluZyB0byBub3RlX2hlYWRpbmdzXHJcbiAgICAgICAgICBub3RlX2hlYWRpbmdzICs9IGAke21kX2hlYWRpbmd9ICR7aGVhZGluZ190ZXh0fVxcbmA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZpbGVfZW1iZWRfaW5wdXQgKz0gbm90ZV9oZWFkaW5ncztcclxuICAgICAgICBpZiAoZmlsZV9lbWJlZF9pbnB1dC5sZW5ndGggPiBNQVhfRU1CRURfU1RSSU5HX0xFTkdUSCkge1xyXG4gICAgICAgICAgZmlsZV9lbWJlZF9pbnB1dCA9IGZpbGVfZW1iZWRfaW5wdXQuc3Vic3RyaW5nKFxyXG4gICAgICAgICAgICAwLFxyXG4gICAgICAgICAgICBNQVhfRU1CRURfU1RSSU5HX0xFTkdUSFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIHNraXAgZW1iZWRkaW5nIGZ1bGwgZmlsZSBpZiBibG9ja3MgaXMgbm90IGVtcHR5IGFuZCBhbGwgaGFzaGVzIGFyZSBwcmVzZW50IGluIGVtYmVkZGluZ3NcclxuICAgIC8vIGJldHRlciB0aGFuIGhhc2hpbmcgZmlsZV9lbWJlZF9pbnB1dCBiZWNhdXNlIG1vcmUgcmVzaWxpZW50IHRvIGluY29uc2VxdWVudGlhbCBjaGFuZ2VzICh3aGl0ZXNwYWNlIGJldHdlZW4gaGVhZGluZ3MpXHJcbiAgICBjb25zdCBmaWxlX2hhc2ggPSBtZDUoZmlsZV9lbWJlZF9pbnB1dC50cmltKCkpO1xyXG4gICAgY29uc3QgZXhpc3RpbmdfaGFzaCA9IHRoaXMuc21hcnRfdmVjX2xpdGUuZ2V0X2hhc2goY3Vycl9maWxlX2tleSk7XHJcbiAgICBpZiAoZXhpc3RpbmdfaGFzaCAmJiBmaWxlX2hhc2ggPT09IGV4aXN0aW5nX2hhc2gpIHtcclxuICAgICAgdGhpcy51cGRhdGVfcmVuZGVyX2xvZyhibG9ja3MsIGZpbGVfZW1iZWRfaW5wdXQpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gaWYgbm90IGFscmVhZHkgc2tpcHBpbmcgYW5kIGJsb2NrcyBhcmUgcHJlc2VudFxyXG4gICAgY29uc3QgZXhpc3RpbmdfYmxvY2tzID0gdGhpcy5zbWFydF92ZWNfbGl0ZS5nZXRfY2hpbGRyZW4oY3Vycl9maWxlX2tleSk7XHJcbiAgICBsZXQgZXhpc3RpbmdfaGFzX2FsbF9ibG9ja3MgPSB0cnVlO1xyXG4gICAgaWYgKFxyXG4gICAgICBleGlzdGluZ19ibG9ja3MgJiZcclxuICAgICAgQXJyYXkuaXNBcnJheShleGlzdGluZ19ibG9ja3MpICYmXHJcbiAgICAgIGJsb2Nrcy5sZW5ndGggPiAwXHJcbiAgICApIHtcclxuICAgICAgLy8gaWYgYWxsIGJsb2NrcyBhcmUgaW4gZXhpc3RpbmdfYmxvY2tzIHRoZW4gc2tpcCAoYWxsb3dzIGRlbGV0aW9uIG9mIHNtYWxsIGJsb2NrcyB3aXRob3V0IHRyaWdnZXJpbmcgZnVsbCBmaWxlIGVtYmVkZGluZylcclxuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBibG9ja3MubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICBpZiAoZXhpc3RpbmdfYmxvY2tzLmluZGV4T2YoYmxvY2tzW2pdKSA9PT0gLTEpIHtcclxuICAgICAgICAgIGV4aXN0aW5nX2hhc19hbGxfYmxvY2tzID0gZmFsc2U7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIGlmIGV4aXN0aW5nIGhhcyBhbGwgYmxvY2tzIHRoZW4gY2hlY2sgZmlsZSBzaXplIGZvciBkZWx0YVxyXG4gICAgaWYgKGV4aXN0aW5nX2hhc19hbGxfYmxvY2tzKSB7XHJcbiAgICAgIC8vIGdldCBjdXJyZW50IG5vdGUgZmlsZSBzaXplXHJcbiAgICAgIGNvbnN0IGN1cnJfZmlsZV9zaXplID0gY3Vycl9maWxlLnN0YXQuc2l6ZTtcclxuICAgICAgLy8gZ2V0IGZpbGUgc2l6ZSBmcm9tIGVtYmVkZGluZ3NcclxuICAgICAgY29uc3QgcHJldl9maWxlX3NpemUgPSB0aGlzLnNtYXJ0X3ZlY19saXRlLmdldF9zaXplKGN1cnJfZmlsZV9rZXkpO1xyXG4gICAgICBpZiAocHJldl9maWxlX3NpemUpIHtcclxuICAgICAgICAvLyBpZiBjdXJyIGZpbGUgc2l6ZSBpcyBsZXNzIHRoYW4gMTAlIGRpZmZlcmVudCBmcm9tIHByZXYgZmlsZSBzaXplXHJcbiAgICAgICAgY29uc3QgZmlsZV9kZWx0YV9wY3QgPSBNYXRoLnJvdW5kKFxyXG4gICAgICAgICAgKE1hdGguYWJzKGN1cnJfZmlsZV9zaXplIC0gcHJldl9maWxlX3NpemUpIC8gY3Vycl9maWxlX3NpemUpICogMTAwXHJcbiAgICAgICAgKTtcclxuICAgICAgICBpZiAoZmlsZV9kZWx0YV9wY3QgPCAxMCkge1xyXG4gICAgICAgICAgdGhpcy5yZW5kZXJfbG9nLnNraXBwZWRfbG93X2RlbHRhW2N1cnJfZmlsZS5uYW1lXSA9XHJcbiAgICAgICAgICAgIGZpbGVfZGVsdGFfcGN0ICsgXCIlXCI7XHJcbiAgICAgICAgICB0aGlzLnVwZGF0ZV9yZW5kZXJfbG9nKGJsb2NrcywgZmlsZV9lbWJlZF9pbnB1dCk7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBsZXQgbWV0YSA9IHtcclxuICAgICAgbXRpbWU6IGN1cnJfZmlsZS5zdGF0Lm10aW1lLFxyXG4gICAgICBoYXNoOiBmaWxlX2hhc2gsXHJcbiAgICAgIHBhdGg6IGN1cnJfZmlsZS5wYXRoLFxyXG4gICAgICBzaXplOiBjdXJyX2ZpbGUuc3RhdC5zaXplLFxyXG4gICAgICBjaGlsZHJlbjogYmxvY2tzLFxyXG4gICAgfTtcclxuICAgIC8vIGJhdGNoX3Byb21pc2VzLnB1c2godGhpcy5nZXRfZW1iZWRkaW5ncyhjdXJyX2ZpbGVfa2V5LCBmaWxlX2VtYmVkX2lucHV0LCBtZXRhKSk7XHJcbiAgICByZXFfYmF0Y2gucHVzaChbY3Vycl9maWxlX2tleSwgZmlsZV9lbWJlZF9pbnB1dCwgbWV0YV0pO1xyXG4gICAgLy8gc2VuZCBiYXRjaCByZXF1ZXN0XHJcbiAgICBhd2FpdCB0aGlzLmdldF9lbWJlZGRpbmdzX2JhdGNoKHJlcV9iYXRjaCk7XHJcbiAgICBpZiAoc2F2ZSkge1xyXG4gICAgICAvLyB3cml0ZSBlbWJlZGRpbmdzIEpTT04gdG8gZmlsZVxyXG4gICAgICBhd2FpdCB0aGlzLnNhdmVfZW1iZWRkaW5nc190b19maWxlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB1cGRhdGVfcmVuZGVyX2xvZyhibG9ja3MsIGZpbGVfZW1iZWRfaW5wdXQpIHtcclxuICAgIGlmIChibG9ja3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAvLyBtdWx0aXBseSBieSAyIGJlY2F1c2UgaW1wbGllcyB3ZSBzYXZlZCB0b2tlbiBzcGVuZGluZyBvbiBibG9ja3Moc2VjdGlvbnMpLCB0b29cclxuICAgICAgdGhpcy5yZW5kZXJfbG9nLnRva2Vuc19zYXZlZF9ieV9jYWNoZSArPSBmaWxlX2VtYmVkX2lucHV0Lmxlbmd0aCAvIDI7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBjYWxjIHRva2VucyBzYXZlZCBieSBjYWNoZTogZGl2aWRlIGJ5IDQgZm9yIHRva2VuIGVzdGltYXRlXHJcbiAgICAgIHRoaXMucmVuZGVyX2xvZy50b2tlbnNfc2F2ZWRfYnlfY2FjaGUgKz0gZmlsZV9lbWJlZF9pbnB1dC5sZW5ndGggLyA0O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2V0X2VtYmVkZGluZ3NfYmF0Y2gocmVxX2JhdGNoKSB7XHJcbiAgICBjb25zb2xlLmxvZyhcImdldF9lbWJlZGRpbmdzX2JhdGNoXCIpO1xyXG4gICAgLy8gaWYgcmVxX2JhdGNoIGlzIGVtcHR5IHRoZW4gcmV0dXJuXHJcbiAgICBpZiAocmVxX2JhdGNoLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xyXG4gICAgLy8gY3JlYXRlIGFycmFyeSBvZiBlbWJlZF9pbnB1dHMgZnJvbSByZXFfYmF0Y2hbaV1bMV1cclxuICAgIGNvbnN0IGVtYmVkX2lucHV0cyA9IHJlcV9iYXRjaC5tYXAoKHJlcSkgPT4gcmVxWzFdKTtcclxuICAgIC8vIHJlcXVlc3QgZW1iZWRkaW5ncyBmcm9tIGVtYmVkX2lucHV0c1xyXG4gICAgY29uc3QgcmVxdWVzdFJlc3VsdHMgPSBhd2FpdCB0aGlzLnJlcXVlc3RfZW1iZWRkaW5nX2Zyb21faW5wdXQoXHJcbiAgICAgIGVtYmVkX2lucHV0c1xyXG4gICAgKTtcclxuICAgIC8vIGlmIHJlcXVlc3RSZXN1bHRzIGlzIG51bGwgdGhlbiByZXR1cm5cclxuICAgIGlmICghcmVxdWVzdFJlc3VsdHMpIHtcclxuICAgICAgY29uc29sZS5sb2coXCJmYWlsZWQgZW1iZWRkaW5nIGJhdGNoXCIpO1xyXG4gICAgICAvLyBsb2cgZmFpbGVkIGZpbGUgbmFtZXMgdG8gcmVuZGVyX2xvZ1xyXG4gICAgICB0aGlzLnJlbmRlcl9sb2cuZmFpbGVkX2VtYmVkZGluZ3MgPSBbXHJcbiAgICAgICAgLi4udGhpcy5yZW5kZXJfbG9nLmZhaWxlZF9lbWJlZGRpbmdzLFxyXG4gICAgICAgIC4uLnJlcV9iYXRjaC5tYXAoKHJlcSkgPT4gcmVxWzJdLnBhdGgpLFxyXG4gICAgICBdO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICAvLyBpZiByZXF1ZXN0UmVzdWx0cyBpcyBub3QgbnVsbFxyXG4gICAgaWYgKHJlcXVlc3RSZXN1bHRzKSB7XHJcbiAgICAgIHRoaXMuaGFzX25ld19lbWJlZGRpbmdzID0gdHJ1ZTtcclxuICAgICAgLy8gYWRkIGVtYmVkZGluZyBrZXkgdG8gcmVuZGVyX2xvZ1xyXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5sb2dfcmVuZGVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MubG9nX3JlbmRlcl9maWxlcykge1xyXG4gICAgICAgICAgdGhpcy5yZW5kZXJfbG9nLmZpbGVzID0gW1xyXG4gICAgICAgICAgICAuLi50aGlzLnJlbmRlcl9sb2cuZmlsZXMsXHJcbiAgICAgICAgICAgIC4uLnJlcV9iYXRjaC5tYXAoKHJlcSkgPT4gcmVxWzJdLnBhdGgpLFxyXG4gICAgICAgICAgXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5yZW5kZXJfbG9nLm5ld19lbWJlZGRpbmdzICs9IHJlcV9iYXRjaC5sZW5ndGg7XHJcbiAgICAgICAgLy8gYWRkIHRva2VuIHVzYWdlIHRvIHJlbmRlcl9sb2dcclxuICAgICAgICB0aGlzLnJlbmRlcl9sb2cudG9rZW5fdXNhZ2UgKz0gcmVxdWVzdFJlc3VsdHMudXNhZ2UudG90YWxfdG9rZW5zO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmVxdWVzdFJlc3VsdHMuZGF0YS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IHZlYyA9IHJlcXVlc3RSZXN1bHRzLmRhdGFbaV0uZW1iZWRkaW5nO1xyXG4gICAgICAgIGNvbnN0IGluZGV4ID0gcmVxdWVzdFJlc3VsdHMuZGF0YVtpXS5pbmRleDtcclxuICAgICAgICBpZiAodmVjKSB7XHJcbiAgICAgICAgICBjb25zdCBrZXkgPSByZXFfYmF0Y2hbaW5kZXhdWzBdO1xyXG4gICAgICAgICAgY29uc3QgbWV0YSA9IHJlcV9iYXRjaFtpbmRleF1bMl07XHJcbiAgICAgICAgICB0aGlzLnNtYXJ0X3ZlY19saXRlLnNhdmVfZW1iZWRkaW5nKGtleSwgdmVjLCBtZXRhKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIHJlcXVlc3RfZW1iZWRkaW5nX2Zyb21faW5wdXQoZW1iZWRfaW5wdXQsIHJldHJpZXMgPSAwKSB7XHJcbiAgICBpZiAoZW1iZWRfaW5wdXQubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKFwiZW1iZWRfaW5wdXQgaXMgZW1wdHlcIik7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNlbGVjdGVkUHJvZmlsZSA9XHJcbiAgICAgIHRoaXMuc2V0dGluZ3MucHJvZmlsZXNbdGhpcy5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleF07XHJcblxyXG4gICAgLy8gQXNzdW1pbmcgc2VsZWN0ZWRQcm9maWxlLnJlcXVlc3RCb2R5IGlzIGEgSlNPTiBzdHJpbmcgd2l0aCBhIHBsYWNlaG9sZGVyXHJcbiAgICAvLyBQYXJzZSB0aGUgcmVxdWVzdEJvZHkgdG8gYW4gb2JqZWN0XHJcbiAgICBsZXQgcmVxdWVzdEJvZHlPYmogPSBKU09OLnBhcnNlKHNlbGVjdGVkUHJvZmlsZS5yZXF1ZXN0Qm9keSk7XHJcblxyXG4gICAgLy8gQ29udmVydCB0aGUgb2JqZWN0IGJhY2sgdG8gYSBzdHJpbmdcclxuICAgIGxldCByZXF1ZXN0Qm9keVN0ciA9IEpTT04uc3RyaW5naWZ5KHJlcXVlc3RCb2R5T2JqKTtcclxuICAgIHJlcXVlc3RCb2R5U3RyID0gcmVxdWVzdEJvZHlTdHIucmVwbGFjZShcclxuICAgICAgL1wie2VtYmVkX2lucHV0fVwiL2csXHJcbiAgICAgIEpTT04uc3RyaW5naWZ5KGVtYmVkX2lucHV0KVxyXG4gICAgKTtcclxuICAgIHJlcXVlc3RCb2R5T2JqID0gSlNPTi5wYXJzZShyZXF1ZXN0Qm9keVN0cik7XHJcbiAgICAvLyBQcmVwYXJlIHRoZSByZXF1ZXN0IHBhcmFtZXRlcnNcclxuICAgIGNvbnN0IHJlcVBhcmFtcyA9IHtcclxuICAgICAgdXJsOiBzZWxlY3RlZFByb2ZpbGUuZW5kcG9pbnQsXHJcbiAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlcXVlc3RCb2R5T2JqKSwgLy8gQ29udmVydCBiYWNrIHRvIEpTT04gc3RyaW5nIGFmdGVyIHJlcGxhY2luZyBpbnB1dFxyXG4gICAgICBoZWFkZXJzOiBKU09OLnBhcnNlKHNlbGVjdGVkUHJvZmlsZS5oZWFkZXJzKSwgLy8gUGFyc2UgaGVhZGVycyBmcm9tIEpTT04gc3RyaW5nXHJcbiAgICB9O1xyXG5cclxuICAgIGxldCByZXNwO1xyXG4gICAgdHJ5IHtcclxuICAgICAgcmVzcCA9IGF3YWl0ICgwLCBPYnNpZGlhbi5yZXF1ZXN0KShyZXFQYXJhbXMpO1xyXG4gICAgICBsZXQgcGFyc2VkUmVzcCA9IEpTT04ucGFyc2UocmVzcCk7XHJcblxyXG4gICAgICBjb25zdCBlbWJlZGRpbmdWZWN0b3IgPSBnZXRFbWJlZGRpbmdWZWN0b3JGcm9tUmVzcG9uc2UoXHJcbiAgICAgICAgcGFyc2VkUmVzcCxcclxuICAgICAgICBzZWxlY3RlZFByb2ZpbGUucmVzcG9uc2VKU09OXHJcbiAgICAgICk7XHJcbiAgICAgIGNvbnN0IGFkanVzdGVkUmVzcG9uc2UgPSB7IGRhdGE6IFt7IGVtYmVkZGluZzogZW1iZWRkaW5nVmVjdG9yLCBpbmRleDogMCB9XSB9O1xyXG5cclxuICAgICAgcmV0dXJuIGFkanVzdGVkUmVzcG9uc2U7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAvLyByZXRyeSByZXF1ZXN0IGlmIGVycm9yIGlzIDQyOVxyXG4gICAgICBpZiAoZXJyb3Iuc3RhdHVzID09PSA0MjkgJiYgcmV0cmllcyA8IDMpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcImVycm9yIHN0YXR1czpcIiwgZXJyb3Iuc3RhdHVzKTtcclxuICAgICAgICByZXRyaWVzKys7XHJcbiAgICAgICAgLy8gZXhwb25lbnRpYWwgYmFja29mZlxyXG4gICAgICAgIGNvbnN0IGJhY2tvZmYgPSBNYXRoLnBvdyhyZXRyaWVzLCAyKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgcmV0cnlpbmcgcmVxdWVzdCAoNDI5KSBpbiAke2JhY2tvZmZ9IHNlY29uZHMuLi5gKTtcclxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCAxMDAwICogYmFja29mZikpO1xyXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnJlcXVlc3RfZW1iZWRkaW5nX2Zyb21faW5wdXQoZW1iZWRfaW5wdXQsIHJldHJpZXMpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldEVtYmVkZGluZ1ZlY3RvckZyb21SZXNwb25zZShyZXNwb25zZUpzb24sIHJlc3BvbnNlRm9ybWF0KSB7XHJcbiAgICAgIC8vIFBhcnNlIHRoZSByZXNwb25zZSBmb3JtYXQgSlNPTiBzdHJpbmdcclxuICAgICAgbGV0IGZvcm1hdE9iaiA9IEpTT04ucGFyc2UocmVzcG9uc2VGb3JtYXQpO1xyXG5cclxuICAgICAgLy8gRmluZCB0aGUgcGF0aCB0byB0aGUgcGxhY2Vob2xkZXIgaW4gdGhlIGZvcm1hdCBvYmplY3RcclxuICAgICAgbGV0IHBhdGhUb0VtYmVkZGluZyA9IGZpbmRQYXRoVG9FbWJlZGRpbmcoZm9ybWF0T2JqLCBcIntlbWJlZF9vdXRwdXR9XCIpO1xyXG5cclxuXHJcbiAgICAgIC8vIEV4dHJhY3QgdGhlIGVtYmVkZGluZyB2ZWN0b3IgZnJvbSB0aGUgcmVzcG9uc2UgSlNPTiB1c2luZyB0aGUgZm91bmQgcGF0aFxyXG4gICAgICBsZXQgZW1iZWRkaW5nVmVjdG9yID0gZ2V0VmFsdWVBdFBhdGgocmVzcG9uc2VKc29uLCBwYXRoVG9FbWJlZGRpbmcpO1xyXG5cclxuICAgICAgcmV0dXJuIGVtYmVkZGluZ1ZlY3RvcjtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBmaW5kUGF0aFRvRW1iZWRkaW5nKG9iaiwgcGxhY2Vob2xkZXIsIHBhdGggPSBcIlwiKSB7XHJcbiAgICAgIGlmICh0eXBlb2Ygb2JqID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgZm9yIChsZXQga2V5IGluIG9iaikge1xyXG4gICAgICAgICAgaWYgKG9ialtrZXldID09PSBwbGFjZWhvbGRlcikge1xyXG4gICAgICAgICAgICByZXR1cm4gcGF0aCArIChwYXRoID8gXCIuXCIgOiBcIlwiKSArIGtleTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9ialtrZXldID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgICAgIGxldCByZXN1bHQgPSBmaW5kUGF0aFRvRW1iZWRkaW5nKFxyXG4gICAgICAgICAgICAgIG9ialtrZXldLFxyXG4gICAgICAgICAgICAgIHBsYWNlaG9sZGVyLFxyXG4gICAgICAgICAgICAgIHBhdGggKyAocGF0aCA/IFwiLlwiIDogXCJcIikgKyBrZXlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWYgKHJlc3VsdCkge1xyXG4gICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0VmFsdWVBdFBhdGgob2JqLCBwYXRoKSB7XHJcbiAgICAgIGxldCBwYXJ0cyA9IHBhdGguc3BsaXQoXCIuXCIpO1xyXG4gICAgICBsZXQgY3VycmVudCA9IG9iajtcclxuICAgICAgZm9yIChsZXQgcGFydCBvZiBwYXJ0cykge1xyXG4gICAgICAgIGlmIChjdXJyZW50W3BhcnRdID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50W3BhcnRdO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBjdXJyZW50O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgb3V0cHV0X3JlbmRlcl9sb2coKSB7XHJcbiAgICAvLyBpZiBzZXR0aW5ncy5sb2dfcmVuZGVyIGlzIHRydWVcclxuICAgIGlmICh0aGlzLnNldHRpbmdzLmxvZ19yZW5kZXIpIHtcclxuICAgICAgaWYgKHRoaXMucmVuZGVyX2xvZy5uZXdfZW1iZWRkaW5ncyA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBwcmV0dHkgcHJpbnQgdGhpcy5yZW5kZXJfbG9nIHRvIGNvbnNvbGVcclxuICAgICAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeSh0aGlzLnJlbmRlcl9sb2csIG51bGwsIDIpKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIGNsZWFyIHJlbmRlcl9sb2dcclxuICAgIHRoaXMucmVuZGVyX2xvZyA9IHt9O1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLmRlbGV0ZWRfZW1iZWRkaW5ncyA9IDA7XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cuZXhjbHVzaW9uc19sb2dzID0ge307XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cuZmFpbGVkX2VtYmVkZGluZ3MgPSBbXTtcclxuICAgIHRoaXMucmVuZGVyX2xvZy5maWxlcyA9IFtdO1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLm5ld19lbWJlZGRpbmdzID0gMDtcclxuICAgIHRoaXMucmVuZGVyX2xvZy5za2lwcGVkX2xvd19kZWx0YSA9IHt9O1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLnRva2VuX3VzYWdlID0gMDtcclxuICAgIHRoaXMucmVuZGVyX2xvZy50b2tlbnNfc2F2ZWRfYnlfY2FjaGUgPSAwO1xyXG4gIH1cclxuXHJcbiAgLy8gZmluZCBjb25uZWN0aW9ucyBieSBtb3N0IHNpbWlsYXIgdG8gY3VycmVudCBub3RlIGJ5IGNvc2luZSBzaW1pbGFyaXR5XHJcbiAgYXN5bmMgZmluZF9ub3RlX2Nvbm5lY3Rpb25zKGN1cnJlbnRfbm90ZSA9IG51bGwpIHtcclxuICAgIC8vIG1kNSBvZiBjdXJyZW50IG5vdGUgcGF0aFxyXG4gICAgY29uc3QgY3Vycl9rZXkgPSBtZDUoY3VycmVudF9ub3RlLnBhdGgpO1xyXG4gICAgLy8gaWYgaW4gdGhpcy5uZWFyZXN0X2NhY2hlIHRoZW4gc2V0IHRvIG5lYXJlc3RcclxuICAgIC8vIGVsc2UgZ2V0IG5lYXJlc3RcclxuICAgIGxldCBuZWFyZXN0ID0gW107XHJcbiAgICBpZiAodGhpcy5uZWFyZXN0X2NhY2hlW2N1cnJfa2V5XSkge1xyXG4gICAgICBuZWFyZXN0ID0gdGhpcy5uZWFyZXN0X2NhY2hlW2N1cnJfa2V5XTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIHNraXAgZmlsZXMgd2hlcmUgcGF0aCBjb250YWlucyBhbnkgZXhjbHVzaW9uc1xyXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMuZmlsZV9leGNsdXNpb25zLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRfbm90ZS5wYXRoLmluZGV4T2YodGhpcy5maWxlX2V4Y2x1c2lvbnNbal0pID4gLTEpIHtcclxuICAgICAgICAgIHRoaXMubG9nX2V4Y2x1c2lvbih0aGlzLmZpbGVfZXhjbHVzaW9uc1tqXSk7XHJcbiAgICAgICAgICAvLyBicmVhayBvdXQgb2YgbG9vcCBhbmQgZmluaXNoIGhlcmVcclxuICAgICAgICAgIHJldHVybiBcImV4Y2x1ZGVkXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIC8vIGdldCBhbGwgZW1iZWRkaW5nc1xyXG4gICAgICAvLyBhd2FpdCB0aGlzLmdldF9hbGxfZW1iZWRkaW5ncygpO1xyXG4gICAgICAvLyB3cmFwIGdldCBhbGwgaW4gc2V0VGltZW91dCB0byBhbGxvdyBmb3IgVUkgdG8gdXBkYXRlXHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuZ2V0X2FsbF9lbWJlZGRpbmdzKCk7XHJcbiAgICAgIH0sIDMwMDApO1xyXG4gICAgICAvLyBnZXQgZnJvbSBjYWNoZSBpZiBtdGltZSBpcyBzYW1lIGFuZCB2YWx1ZXMgYXJlIG5vdCBlbXB0eVxyXG4gICAgICBpZiAoXHJcbiAgICAgICAgdGhpcy5zbWFydF92ZWNfbGl0ZS5tdGltZV9pc19jdXJyZW50KGN1cnJfa2V5LCBjdXJyZW50X25vdGUuc3RhdC5tdGltZSlcclxuICAgICAgKSB7XHJcbiAgICAgICAgLy8gc2tpcHBpbmcgZ2V0IGZpbGUgZW1iZWRkaW5ncyBiZWNhdXNlIG5vdGhpbmcgaGFzIGNoYW5nZWRcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBnZXQgZmlsZSBlbWJlZGRpbmdzXHJcbiAgICAgICAgYXdhaXQgdGhpcy5nZXRfZmlsZV9lbWJlZGRpbmdzKGN1cnJlbnRfbm90ZSk7XHJcbiAgICAgIH1cclxuICAgICAgLy8gZ2V0IGN1cnJlbnQgbm90ZSBlbWJlZGRpbmcgdmVjdG9yXHJcbiAgICAgIGNvbnN0IHZlYyA9IHRoaXMuc21hcnRfdmVjX2xpdGUuZ2V0X3ZlYyhjdXJyX2tleSk7XHJcbiAgICAgIGlmICghdmVjKSB7XHJcbiAgICAgICAgcmV0dXJuIFwiRXJyb3IgZ2V0dGluZyBlbWJlZGRpbmdzIGZvcjogXCIgKyBjdXJyZW50X25vdGUucGF0aDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gY29tcHV0ZSBjb3NpbmUgc2ltaWxhcml0eSBiZXR3ZWVuIGN1cnJlbnQgbm90ZSBhbmQgYWxsIG90aGVyIG5vdGVzIHZpYSBlbWJlZGRpbmdzXHJcbiAgICAgIG5lYXJlc3QgPSB0aGlzLnNtYXJ0X3ZlY19saXRlLm5lYXJlc3QodmVjLCB7XHJcbiAgICAgICAgc2tpcF9rZXk6IGN1cnJfa2V5LFxyXG4gICAgICAgIHNraXBfc2VjdGlvbnM6IHRoaXMuc2V0dGluZ3Muc2tpcF9zZWN0aW9ucyxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBzYXZlIHRvIHRoaXMubmVhcmVzdF9jYWNoZVxyXG4gICAgICB0aGlzLm5lYXJlc3RfY2FjaGVbY3Vycl9rZXldID0gbmVhcmVzdDtcclxuICAgIH1cclxuXHJcbiAgICAvLyByZXR1cm4gYXJyYXkgc29ydGVkIGJ5IGNvc2luZSBzaW1pbGFyaXR5XHJcbiAgICByZXR1cm4gbmVhcmVzdDtcclxuICB9XHJcblxyXG4gIC8vIGNyZWF0ZSByZW5kZXJfbG9nIG9iamVjdCBvZiBleGx1c2lvbnMgd2l0aCBudW1iZXIgb2YgdGltZXMgc2tpcHBlZCBhcyB2YWx1ZVxyXG4gIGxvZ19leGNsdXNpb24oZXhjbHVzaW9uKSB7XHJcbiAgICAvLyBpbmNyZW1lbnQgcmVuZGVyX2xvZyBmb3Igc2tpcHBlZCBmaWxlXHJcbiAgICB0aGlzLnJlbmRlcl9sb2cuZXhjbHVzaW9uc19sb2dzW2V4Y2x1c2lvbl0gPVxyXG4gICAgICAodGhpcy5yZW5kZXJfbG9nLmV4Y2x1c2lvbnNfbG9nc1tleGNsdXNpb25dIHx8IDApICsgMTtcclxuICB9XHJcblxyXG4gIGJsb2NrX3BhcnNlcihtYXJrZG93biwgZmlsZV9wYXRoKSB7XHJcbiAgICAvLyBpZiB0aGlzLnNldHRpbmdzLnNraXBfc2VjdGlvbnMgaXMgdHJ1ZSB0aGVuIHJldHVybiBlbXB0eSBhcnJheVxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3Muc2tpcF9zZWN0aW9ucykge1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcbiAgICAvLyBzcGxpdCB0aGUgbWFya2Rvd24gaW50byBsaW5lc1xyXG4gICAgY29uc3QgbGluZXMgPSBtYXJrZG93bi5zcGxpdChcIlxcblwiKTtcclxuICAgIC8vIGluaXRpYWxpemUgdGhlIGJsb2NrcyBhcnJheVxyXG4gICAgbGV0IGJsb2NrcyA9IFtdO1xyXG4gICAgLy8gY3VycmVudCBoZWFkZXJzIGFycmF5XHJcbiAgICBsZXQgY3VycmVudEhlYWRlcnMgPSBbXTtcclxuICAgIC8vIHJlbW92ZSAubWQgZmlsZSBleHRlbnNpb24gYW5kIGNvbnZlcnQgZmlsZV9wYXRoIHRvIGJyZWFkY3J1bWIgZm9ybWF0dGluZ1xyXG4gICAgY29uc3QgZmlsZV9icmVhZGNydW1icyA9IGZpbGVfcGF0aC5yZXBsYWNlKFwiLm1kXCIsIFwiXCIpLnJlcGxhY2UoL1xcLy9nLCBcIiA+IFwiKTtcclxuICAgIC8vIGluaXRpYWxpemUgdGhlIGJsb2NrIHN0cmluZ1xyXG4gICAgbGV0IGJsb2NrID0gXCJcIjtcclxuICAgIGxldCBibG9ja19oZWFkaW5ncyA9IFwiXCI7XHJcbiAgICBsZXQgYmxvY2tfcGF0aCA9IGZpbGVfcGF0aDtcclxuXHJcbiAgICBsZXQgbGFzdF9oZWFkaW5nX2xpbmUgPSAwO1xyXG4gICAgbGV0IGkgPSAwO1xyXG4gICAgbGV0IGJsb2NrX2hlYWRpbmdzX2xpc3QgPSBbXTtcclxuICAgIC8vIGxvb3AgdGhyb3VnaCB0aGUgbGluZXNcclxuICAgIGZvciAoaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAvLyBnZXQgdGhlIGxpbmVcclxuICAgICAgY29uc3QgbGluZSA9IGxpbmVzW2ldO1xyXG4gICAgICAvLyBpZiBsaW5lIGRvZXMgbm90IHN0YXJ0IHdpdGggI1xyXG4gICAgICAvLyBvciBpZiBsaW5lIHN0YXJ0cyB3aXRoICMgYW5kIHNlY29uZCBjaGFyYWN0ZXIgaXMgYSB3b3JkIG9yIG51bWJlciBpbmRpY2F0aW5nIGEgXCJ0YWdcIlxyXG4gICAgICAvLyB0aGVuIGFkZCB0byBibG9ja1xyXG4gICAgICBpZiAoIWxpbmUuc3RhcnRzV2l0aChcIiNcIikgfHwgW1wiI1wiLCBcIiBcIl0uaW5kZXhPZihsaW5lWzFdKSA8IDApIHtcclxuICAgICAgICAvLyBza2lwIGlmIGxpbmUgaXMgZW1wdHlcclxuICAgICAgICBpZiAobGluZSA9PT0gXCJcIikgY29udGludWU7XHJcbiAgICAgICAgLy8gc2tpcCBpZiBsaW5lIGlzIGVtcHR5IGJ1bGxldCBvciBjaGVja2JveFxyXG4gICAgICAgIGlmIChbXCItIFwiLCBcIi0gWyBdIFwiXS5pbmRleE9mKGxpbmUpID4gLTEpIGNvbnRpbnVlO1xyXG4gICAgICAgIC8vIGlmIGN1cnJlbnRIZWFkZXJzIGlzIGVtcHR5IHNraXAgKG9ubHkgYmxvY2tzIHdpdGggaGVhZGVycywgb3RoZXJ3aXNlIGJsb2NrLnBhdGggY29uZmxpY3RzIHdpdGggZmlsZS5wYXRoKVxyXG4gICAgICAgIGlmIChjdXJyZW50SGVhZGVycy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xyXG4gICAgICAgIC8vIGFkZCBsaW5lIHRvIGJsb2NrXHJcbiAgICAgICAgYmxvY2sgKz0gXCJcXG5cIiArIGxpbmU7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuICAgICAgLyoqXHJcbiAgICAgICAqIEJFR0lOIEhlYWRpbmcgcGFyc2luZ1xyXG4gICAgICAgKiAtIGxpa2VseSBhIGhlYWRpbmcgaWYgbWFkZSBpdCB0aGlzIGZhclxyXG4gICAgICAgKi9cclxuICAgICAgbGFzdF9oZWFkaW5nX2xpbmUgPSBpO1xyXG4gICAgICAvLyBwdXNoIHRoZSBjdXJyZW50IGJsb2NrIHRvIHRoZSBibG9ja3MgYXJyYXkgdW5sZXNzIGxhc3QgbGluZSB3YXMgYSBhbHNvIGEgaGVhZGVyXHJcbiAgICAgIGlmIChcclxuICAgICAgICBpID4gMCAmJlxyXG4gICAgICAgIGxhc3RfaGVhZGluZ19saW5lICE9PSBpIC0gMSAmJlxyXG4gICAgICAgIGJsb2NrLmluZGV4T2YoXCJcXG5cIikgPiAtMSAmJlxyXG4gICAgICAgIHRoaXMudmFsaWRhdGVfaGVhZGluZ3MoYmxvY2tfaGVhZGluZ3MpXHJcbiAgICAgICkge1xyXG4gICAgICAgIG91dHB1dF9ibG9jaygpO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGdldCB0aGUgaGVhZGVyIGxldmVsXHJcbiAgICAgIGNvbnN0IGxldmVsID0gbGluZS5zcGxpdChcIiNcIikubGVuZ3RoIC0gMTtcclxuICAgICAgLy8gcmVtb3ZlIGFueSBoZWFkZXJzIGZyb20gdGhlIGN1cnJlbnQgaGVhZGVycyBhcnJheSB0aGF0IGFyZSBoaWdoZXIgdGhhbiB0aGUgY3VycmVudCBoZWFkZXIgbGV2ZWxcclxuICAgICAgY3VycmVudEhlYWRlcnMgPSBjdXJyZW50SGVhZGVycy5maWx0ZXIoKGhlYWRlcikgPT4gaGVhZGVyLmxldmVsIDwgbGV2ZWwpO1xyXG4gICAgICAvLyBhZGQgaGVhZGVyIGFuZCBsZXZlbCB0byBjdXJyZW50IGhlYWRlcnMgYXJyYXlcclxuICAgICAgLy8gdHJpbSB0aGUgaGVhZGVyIHRvIHJlbW92ZSBcIiNcIiBhbmQgYW55IHRyYWlsaW5nIHNwYWNlc1xyXG4gICAgICBjdXJyZW50SGVhZGVycy5wdXNoKHtcclxuICAgICAgICBoZWFkZXI6IGxpbmUucmVwbGFjZSgvIy9nLCBcIlwiKS50cmltKCksXHJcbiAgICAgICAgbGV2ZWw6IGxldmVsLFxyXG4gICAgICB9KTtcclxuICAgICAgLy8gaW5pdGlhbGl6ZSB0aGUgYmxvY2sgYnJlYWRjcnVtYnMgd2l0aCBmaWxlLnBhdGggdGhlIGN1cnJlbnQgaGVhZGVyc1xyXG4gICAgICBibG9jayA9IGZpbGVfYnJlYWRjcnVtYnM7XHJcbiAgICAgIGJsb2NrICs9IFwiOiBcIiArIGN1cnJlbnRIZWFkZXJzLm1hcCgoaGVhZGVyKSA9PiBoZWFkZXIuaGVhZGVyKS5qb2luKFwiID4gXCIpO1xyXG4gICAgICBibG9ja19oZWFkaW5ncyA9XHJcbiAgICAgICAgXCIjXCIgKyBjdXJyZW50SGVhZGVycy5tYXAoKGhlYWRlcikgPT4gaGVhZGVyLmhlYWRlcikuam9pbihcIiNcIik7XHJcbiAgICAgIC8vIGlmIGJsb2NrX2hlYWRpbmdzIGlzIGFscmVhZHkgaW4gYmxvY2tfaGVhZGluZ3NfbGlzdCB0aGVuIGFkZCBhIG51bWJlciB0byB0aGUgZW5kXHJcbiAgICAgIGlmIChibG9ja19oZWFkaW5nc19saXN0LmluZGV4T2YoYmxvY2tfaGVhZGluZ3MpID4gLTEpIHtcclxuICAgICAgICBsZXQgY291bnQgPSAxO1xyXG4gICAgICAgIHdoaWxlIChcclxuICAgICAgICAgIGJsb2NrX2hlYWRpbmdzX2xpc3QuaW5kZXhPZihgJHtibG9ja19oZWFkaW5nc317JHtjb3VudH19YCkgPiAtMVxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgY291bnQrKztcclxuICAgICAgICB9XHJcbiAgICAgICAgYmxvY2tfaGVhZGluZ3MgPSBgJHtibG9ja19oZWFkaW5nc317JHtjb3VudH19YDtcclxuICAgICAgfVxyXG4gICAgICBibG9ja19oZWFkaW5nc19saXN0LnB1c2goYmxvY2tfaGVhZGluZ3MpO1xyXG4gICAgICBibG9ja19wYXRoID0gZmlsZV9wYXRoICsgYmxvY2tfaGVhZGluZ3M7XHJcbiAgICB9XHJcbiAgICAvLyBoYW5kbGUgcmVtYWluaW5nIGFmdGVyIGxvb3BcclxuICAgIGlmIChcclxuICAgICAgbGFzdF9oZWFkaW5nX2xpbmUgIT09IGkgLSAxICYmXHJcbiAgICAgIGJsb2NrLmluZGV4T2YoXCJcXG5cIikgPiAtMSAmJlxyXG4gICAgICB0aGlzLnZhbGlkYXRlX2hlYWRpbmdzKGJsb2NrX2hlYWRpbmdzKVxyXG4gICAgKVxyXG4gICAgICBvdXRwdXRfYmxvY2soKTtcclxuICAgIC8vIHJlbW92ZSBhbnkgYmxvY2tzIHRoYXQgYXJlIHRvbyBzaG9ydCAobGVuZ3RoIDwgNTApXHJcbiAgICBibG9ja3MgPSBibG9ja3MuZmlsdGVyKChiKSA9PiBiLmxlbmd0aCA+IDUwKTtcclxuICAgIC8vIHJldHVybiB0aGUgYmxvY2tzIGFycmF5XHJcbiAgICByZXR1cm4gYmxvY2tzO1xyXG5cclxuICAgIGZ1bmN0aW9uIG91dHB1dF9ibG9jaygpIHtcclxuICAgICAgLy8gYnJlYWRjcnVtYnMgbGVuZ3RoIChmaXJzdCBsaW5lIG9mIGJsb2NrKVxyXG4gICAgICBjb25zdCBicmVhZGNydW1ic19sZW5ndGggPSBibG9jay5pbmRleE9mKFwiXFxuXCIpICsgMTtcclxuICAgICAgY29uc3QgYmxvY2tfbGVuZ3RoID0gYmxvY2subGVuZ3RoIC0gYnJlYWRjcnVtYnNfbGVuZ3RoO1xyXG4gICAgICAvLyB0cmltIGJsb2NrIHRvIG1heCBsZW5ndGhcclxuICAgICAgaWYgKGJsb2NrLmxlbmd0aCA+IE1BWF9FTUJFRF9TVFJJTkdfTEVOR1RIKSB7XHJcbiAgICAgICAgYmxvY2sgPSBibG9jay5zdWJzdHJpbmcoMCwgTUFYX0VNQkVEX1NUUklOR19MRU5HVEgpO1xyXG4gICAgICB9XHJcbiAgICAgIGJsb2Nrcy5wdXNoKHtcclxuICAgICAgICB0ZXh0OiBibG9jay50cmltKCksXHJcbiAgICAgICAgcGF0aDogYmxvY2tfcGF0aCxcclxuICAgICAgICBsZW5ndGg6IGJsb2NrX2xlbmd0aCxcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIC8vIHJldmVyc2UtcmV0cmlldmUgYmxvY2sgZ2l2ZW4gcGF0aFxyXG4gIGFzeW5jIGJsb2NrX3JldHJpZXZlcihwYXRoLCBsaW1pdHMgPSB7fSkge1xyXG4gICAgbGltaXRzID0ge1xyXG4gICAgICBsaW5lczogbnVsbCxcclxuICAgICAgY2hhcnNfcGVyX2xpbmU6IG51bGwsXHJcbiAgICAgIG1heF9jaGFyczogbnVsbCxcclxuICAgICAgLi4ubGltaXRzLFxyXG4gICAgfTtcclxuICAgIC8vIHJldHVybiBpZiBubyAjIGluIHBhdGhcclxuICAgIGlmIChwYXRoLmluZGV4T2YoXCIjXCIpIDwgMCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhcIm5vdCBhIGJsb2NrIHBhdGg6IFwiICsgcGF0aCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICAgIGxldCBibG9jayA9IFtdO1xyXG4gICAgbGV0IGJsb2NrX2hlYWRpbmdzID0gcGF0aC5zcGxpdChcIiNcIikuc2xpY2UoMSk7XHJcbiAgICAvLyBpZiBwYXRoIGVuZHMgd2l0aCBudW1iZXIgaW4gY3VybHkgYnJhY2VzXHJcbiAgICBsZXQgaGVhZGluZ19vY2N1cnJlbmNlID0gMDtcclxuICAgIGlmIChibG9ja19oZWFkaW5nc1tibG9ja19oZWFkaW5ncy5sZW5ndGggLSAxXS5pbmRleE9mKFwie1wiKSA+IC0xKSB7XHJcbiAgICAgIC8vIGdldCB0aGUgb2NjdXJyZW5jZSBudW1iZXJcclxuICAgICAgaGVhZGluZ19vY2N1cnJlbmNlID0gcGFyc2VJbnQoXHJcbiAgICAgICAgYmxvY2tfaGVhZGluZ3NbYmxvY2tfaGVhZGluZ3MubGVuZ3RoIC0gMV0uc3BsaXQoXCJ7XCIpWzFdLnJlcGxhY2UoXCJ9XCIsIFwiXCIpXHJcbiAgICAgICk7XHJcbiAgICAgIC8vIHJlbW92ZSB0aGUgb2NjdXJyZW5jZSBmcm9tIHRoZSBsYXN0IGhlYWRpbmdcclxuICAgICAgYmxvY2tfaGVhZGluZ3NbYmxvY2tfaGVhZGluZ3MubGVuZ3RoIC0gMV0gPVxyXG4gICAgICAgIGJsb2NrX2hlYWRpbmdzW2Jsb2NrX2hlYWRpbmdzLmxlbmd0aCAtIDFdLnNwbGl0KFwie1wiKVswXTtcclxuICAgIH1cclxuICAgIGxldCBjdXJyZW50SGVhZGVycyA9IFtdO1xyXG4gICAgbGV0IG9jY3VycmVuY2VfY291bnQgPSAwO1xyXG4gICAgbGV0IGJlZ2luX2xpbmUgPSAwO1xyXG4gICAgbGV0IGkgPSAwO1xyXG4gICAgLy8gZ2V0IGZpbGUgcGF0aCBmcm9tIHBhdGhcclxuICAgIGNvbnN0IGZpbGVfcGF0aCA9IHBhdGguc3BsaXQoXCIjXCIpWzBdO1xyXG4gICAgLy8gZ2V0IGZpbGVcclxuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZV9wYXRoKTtcclxuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBPYnNpZGlhbi5URmlsZSkpIHtcclxuICAgICAgY29uc29sZS5sb2coXCJub3QgYSBmaWxlOiBcIiArIGZpbGVfcGF0aCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICAgIC8vIGdldCBmaWxlIGNvbnRlbnRzXHJcbiAgICBjb25zdCBmaWxlX2NvbnRlbnRzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcclxuICAgIC8vIHNwbGl0IHRoZSBmaWxlIGNvbnRlbnRzIGludG8gbGluZXNcclxuICAgIGNvbnN0IGxpbmVzID0gZmlsZV9jb250ZW50cy5zcGxpdChcIlxcblwiKTtcclxuICAgIC8vIGxvb3AgdGhyb3VnaCB0aGUgbGluZXNcclxuICAgIGxldCBpc19jb2RlID0gZmFsc2U7XHJcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgLy8gZ2V0IHRoZSBsaW5lXHJcbiAgICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcclxuICAgICAgLy8gaWYgbGluZSBiZWdpbnMgd2l0aCB0aHJlZSBiYWNrdGlja3MgdGhlbiB0b2dnbGUgaXNfY29kZVxyXG4gICAgICBpZiAobGluZS5pbmRleE9mKFwiYGBgXCIpID09PSAwKSB7XHJcbiAgICAgICAgaXNfY29kZSA9ICFpc19jb2RlO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGlmIGlzX2NvZGUgaXMgdHJ1ZSB0aGVuIGFkZCBsaW5lIHdpdGggcHJlY2VkaW5nIHRhYiBhbmQgY29udGludWVcclxuICAgICAgaWYgKGlzX2NvZGUpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICAvLyBza2lwIGlmIGxpbmUgaXMgZW1wdHkgYnVsbGV0IG9yIGNoZWNrYm94XHJcbiAgICAgIGlmIChbXCItIFwiLCBcIi0gWyBdIFwiXS5pbmRleE9mKGxpbmUpID4gLTEpIGNvbnRpbnVlO1xyXG4gICAgICAvLyBpZiBsaW5lIGRvZXMgbm90IHN0YXJ0IHdpdGggI1xyXG4gICAgICAvLyBvciBpZiBsaW5lIHN0YXJ0cyB3aXRoICMgYW5kIHNlY29uZCBjaGFyYWN0ZXIgaXMgYSB3b3JkIG9yIG51bWJlciBpbmRpY2F0aW5nIGEgXCJ0YWdcIlxyXG4gICAgICAvLyB0aGVuIGNvbnRpbnVlIHRvIG5leHQgbGluZVxyXG4gICAgICBpZiAoIWxpbmUuc3RhcnRzV2l0aChcIiNcIikgfHwgW1wiI1wiLCBcIiBcIl0uaW5kZXhPZihsaW5lWzFdKSA8IDApIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICAvKipcclxuICAgICAgICogQkVHSU4gSGVhZGluZyBwYXJzaW5nXHJcbiAgICAgICAqIC0gbGlrZWx5IGEgaGVhZGluZyBpZiBtYWRlIGl0IHRoaXMgZmFyXHJcbiAgICAgICAqL1xyXG4gICAgICAvLyBnZXQgdGhlIGhlYWRpbmcgdGV4dFxyXG4gICAgICBjb25zdCBoZWFkaW5nX3RleHQgPSBsaW5lLnJlcGxhY2UoLyMvZywgXCJcIikudHJpbSgpO1xyXG4gICAgICAvLyBjb250aW51ZSBpZiBoZWFkaW5nIHRleHQgaXMgbm90IGluIGJsb2NrX2hlYWRpbmdzXHJcbiAgICAgIGNvbnN0IGhlYWRpbmdfaW5kZXggPSBibG9ja19oZWFkaW5ncy5pbmRleE9mKGhlYWRpbmdfdGV4dCk7XHJcbiAgICAgIGlmIChoZWFkaW5nX2luZGV4IDwgMCkgY29udGludWU7XHJcbiAgICAgIC8vIGlmIGN1cnJlbnRIZWFkZXJzLmxlbmd0aCAhPT0gaGVhZGluZ19pbmRleCB0aGVuIHdlIGhhdmUgYSBtaXNtYXRjaFxyXG4gICAgICBpZiAoY3VycmVudEhlYWRlcnMubGVuZ3RoICE9PSBoZWFkaW5nX2luZGV4KSBjb250aW51ZTtcclxuICAgICAgLy8gcHVzaCB0aGUgaGVhZGluZyB0ZXh0IHRvIHRoZSBjdXJyZW50SGVhZGVycyBhcnJheVxyXG4gICAgICBjdXJyZW50SGVhZGVycy5wdXNoKGhlYWRpbmdfdGV4dCk7XHJcbiAgICAgIC8vIGlmIGN1cnJlbnRIZWFkZXJzLmxlbmd0aCA9PT0gYmxvY2tfaGVhZGluZ3MubGVuZ3RoIHRoZW4gd2UgaGF2ZSBhIG1hdGNoXHJcbiAgICAgIGlmIChjdXJyZW50SGVhZGVycy5sZW5ndGggPT09IGJsb2NrX2hlYWRpbmdzLmxlbmd0aCkge1xyXG4gICAgICAgIC8vIGlmIGhlYWRpbmdfb2NjdXJyZW5jZSBpcyBkZWZpbmVkIHRoZW4gaW5jcmVtZW50IG9jY3VycmVuY2VfY291bnRcclxuICAgICAgICBpZiAoaGVhZGluZ19vY2N1cnJlbmNlID09PSAwKSB7XHJcbiAgICAgICAgICAvLyBzZXQgYmVnaW5fbGluZSB0byBpICsgMVxyXG4gICAgICAgICAgYmVnaW5fbGluZSA9IGkgKyAxO1xyXG4gICAgICAgICAgYnJlYWs7IC8vIGJyZWFrIG91dCBvZiBsb29wXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGlmIG9jY3VycmVuY2VfY291bnQgIT09IGhlYWRpbmdfb2NjdXJyZW5jZSB0aGVuIGNvbnRpbnVlXHJcbiAgICAgICAgaWYgKG9jY3VycmVuY2VfY291bnQgPT09IGhlYWRpbmdfb2NjdXJyZW5jZSkge1xyXG4gICAgICAgICAgYmVnaW5fbGluZSA9IGkgKyAxO1xyXG4gICAgICAgICAgYnJlYWs7IC8vIGJyZWFrIG91dCBvZiBsb29wXHJcbiAgICAgICAgfVxyXG4gICAgICAgIG9jY3VycmVuY2VfY291bnQrKztcclxuICAgICAgICAvLyByZXNldCBjdXJyZW50SGVhZGVyc1xyXG4gICAgICAgIGN1cnJlbnRIZWFkZXJzLnBvcCgpO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICAvLyBpZiBubyBiZWdpbl9saW5lIHRoZW4gcmV0dXJuIGZhbHNlXHJcbiAgICBpZiAoYmVnaW5fbGluZSA9PT0gMCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgLy8gaXRlcmF0ZSB0aHJvdWdoIGxpbmVzIHN0YXJ0aW5nIGF0IGJlZ2luX2xpbmVcclxuICAgIGlzX2NvZGUgPSBmYWxzZTtcclxuICAgIC8vIGNoYXJhY3RlciBhY2N1bXVsYXRvclxyXG4gICAgbGV0IGNoYXJfY291bnQgPSAwO1xyXG4gICAgZm9yIChpID0gYmVnaW5fbGluZTsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGlmICh0eXBlb2YgbGluZV9saW1pdCA9PT0gXCJudW1iZXJcIiAmJiBibG9jay5sZW5ndGggPiBsaW5lX2xpbWl0KSB7XHJcbiAgICAgICAgYmxvY2sucHVzaChcIi4uLlwiKTtcclxuICAgICAgICBicmVhazsgLy8gZW5kcyB3aGVuIGxpbmVfbGltaXQgaXMgcmVhY2hlZFxyXG4gICAgICB9XHJcbiAgICAgIGxldCBsaW5lID0gbGluZXNbaV07XHJcbiAgICAgIGlmIChsaW5lLmluZGV4T2YoXCIjXCIpID09PSAwICYmIFtcIiNcIiwgXCIgXCJdLmluZGV4T2YobGluZVsxXSkgIT09IC0xKSB7XHJcbiAgICAgICAgYnJlYWs7IC8vIGVuZHMgd2hlbiBlbmNvdW50ZXJpbmcgbmV4dCBoZWFkZXJcclxuICAgICAgfVxyXG4gICAgICAvLyBERVBSRUNBVEVEOiBzaG91bGQgYmUgaGFuZGxlZCBieSBuZXdfbGluZStjaGFyX2NvdW50IGNoZWNrIChoYXBwZW5zIGluIHByZXZpb3VzIGl0ZXJhdGlvbilcclxuICAgICAgLy8gaWYgY2hhcl9jb3VudCBpcyBncmVhdGVyIHRoYW4gbGltaXQubWF4X2NoYXJzLCBza2lwXHJcbiAgICAgIGlmIChsaW1pdHMubWF4X2NoYXJzICYmIGNoYXJfY291bnQgPiBsaW1pdHMubWF4X2NoYXJzKSB7XHJcbiAgICAgICAgYmxvY2sucHVzaChcIi4uLlwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgICAvLyBpZiBuZXdfbGluZSArIGNoYXJfY291bnQgaXMgZ3JlYXRlciB0aGFuIGxpbWl0Lm1heF9jaGFycywgc2tpcFxyXG4gICAgICBpZiAobGltaXRzLm1heF9jaGFycyAmJiBsaW5lLmxlbmd0aCArIGNoYXJfY291bnQgPiBsaW1pdHMubWF4X2NoYXJzKSB7XHJcbiAgICAgICAgY29uc3QgbWF4X25ld19jaGFycyA9IGxpbWl0cy5tYXhfY2hhcnMgLSBjaGFyX2NvdW50O1xyXG4gICAgICAgIGxpbmUgPSBsaW5lLnNsaWNlKDAsIG1heF9uZXdfY2hhcnMpICsgXCIuLi5cIjtcclxuICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgICAvLyB2YWxpZGF0ZS9mb3JtYXRcclxuICAgICAgLy8gaWYgbGluZSBpcyBlbXB0eSwgc2tpcFxyXG4gICAgICBpZiAobGluZS5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xyXG4gICAgICAvLyBsaW1pdCBsZW5ndGggb2YgbGluZSB0byBOIGNoYXJhY3RlcnNcclxuICAgICAgaWYgKGxpbWl0cy5jaGFyc19wZXJfbGluZSAmJiBsaW5lLmxlbmd0aCA+IGxpbWl0cy5jaGFyc19wZXJfbGluZSkge1xyXG4gICAgICAgIGxpbmUgPSBsaW5lLnNsaWNlKDAsIGxpbWl0cy5jaGFyc19wZXJfbGluZSkgKyBcIi4uLlwiO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGlmIGxpbmUgaXMgYSBjb2RlIGJsb2NrLCBza2lwXHJcbiAgICAgIGlmIChsaW5lLnN0YXJ0c1dpdGgoXCJgYGBcIikpIHtcclxuICAgICAgICBpc19jb2RlID0gIWlzX2NvZGU7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGlzX2NvZGUpIHtcclxuICAgICAgICAvLyBhZGQgdGFiIHRvIGJlZ2lubmluZyBvZiBsaW5lXHJcbiAgICAgICAgbGluZSA9IFwiXFx0XCIgKyBsaW5lO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGFkZCBsaW5lIHRvIGJsb2NrXHJcbiAgICAgIGJsb2NrLnB1c2gobGluZSk7XHJcbiAgICAgIC8vIGluY3JlbWVudCBjaGFyX2NvdW50XHJcbiAgICAgIGNoYXJfY291bnQgKz0gbGluZS5sZW5ndGg7XHJcbiAgICB9XHJcbiAgICAvLyBjbG9zZSBjb2RlIGJsb2NrIGlmIG9wZW5cclxuICAgIGlmIChpc19jb2RlKSB7XHJcbiAgICAgIGJsb2NrLnB1c2goXCJgYGBcIik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYmxvY2suam9pbihcIlxcblwiKS50cmltKCk7XHJcbiAgfVxyXG5cclxuICAvLyByZXRyaWV2ZSBhIGZpbGUgZnJvbSB0aGUgdmF1bHRcclxuICBhc3luYyBmaWxlX3JldHJpZXZlcihsaW5rLCBsaW1pdHMgPSB7fSkge1xyXG4gICAgbGltaXRzID0ge1xyXG4gICAgICBsaW5lczogbnVsbCxcclxuICAgICAgbWF4X2NoYXJzOiBudWxsLFxyXG4gICAgICBjaGFyc19wZXJfbGluZTogbnVsbCxcclxuICAgICAgLi4ubGltaXRzLFxyXG4gICAgfTtcclxuICAgIGNvbnN0IHRoaXNfZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChsaW5rKTtcclxuICAgIC8vIGlmIGZpbGUgaXMgbm90IGZvdW5kLCBza2lwXHJcbiAgICBpZiAoISh0aGlzX2ZpbGUgaW5zdGFuY2VvZiBPYnNpZGlhbi5UQWJzdHJhY3RGaWxlKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgLy8gdXNlIGNhY2hlZFJlYWQgdG8gZ2V0IHRoZSBmaXJzdCAxMCBsaW5lcyBvZiB0aGUgZmlsZVxyXG4gICAgY29uc3QgZmlsZV9jb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZCh0aGlzX2ZpbGUpO1xyXG4gICAgY29uc3QgZmlsZV9saW5lcyA9IGZpbGVfY29udGVudC5zcGxpdChcIlxcblwiKTtcclxuICAgIGxldCBmaXJzdF90ZW5fbGluZXMgPSBbXTtcclxuICAgIGxldCBpc19jb2RlID0gZmFsc2U7XHJcbiAgICBsZXQgY2hhcl9hY2N1bSA9IDA7XHJcbiAgICBjb25zdCBsaW5lX2xpbWl0ID0gbGltaXRzLmxpbmVzIHx8IGZpbGVfbGluZXMubGVuZ3RoO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGZpcnN0X3Rlbl9saW5lcy5sZW5ndGggPCBsaW5lX2xpbWl0OyBpKyspIHtcclxuICAgICAgbGV0IGxpbmUgPSBmaWxlX2xpbmVzW2ldO1xyXG4gICAgICAvLyBpZiBsaW5lIGlzIHVuZGVmaW5lZCwgYnJlYWtcclxuICAgICAgaWYgKHR5cGVvZiBsaW5lID09PSBcInVuZGVmaW5lZFwiKSBicmVhaztcclxuICAgICAgLy8gaWYgbGluZSBpcyBlbXB0eSwgc2tpcFxyXG4gICAgICBpZiAobGluZS5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xyXG4gICAgICAvLyBsaW1pdCBsZW5ndGggb2YgbGluZSB0byBOIGNoYXJhY3RlcnNcclxuICAgICAgaWYgKGxpbWl0cy5jaGFyc19wZXJfbGluZSAmJiBsaW5lLmxlbmd0aCA+IGxpbWl0cy5jaGFyc19wZXJfbGluZSkge1xyXG4gICAgICAgIGxpbmUgPSBsaW5lLnNsaWNlKDAsIGxpbWl0cy5jaGFyc19wZXJfbGluZSkgKyBcIi4uLlwiO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGlmIGxpbmUgaXMgXCItLS1cIiwgc2tpcFxyXG4gICAgICBpZiAobGluZSA9PT0gXCItLS1cIikgY29udGludWU7XHJcbiAgICAgIC8vIHNraXAgaWYgbGluZSBpcyBlbXB0eSBidWxsZXQgb3IgY2hlY2tib3hcclxuICAgICAgaWYgKFtcIi0gXCIsIFwiLSBbIF0gXCJdLmluZGV4T2YobGluZSkgPiAtMSkgY29udGludWU7XHJcbiAgICAgIC8vIGlmIGxpbmUgaXMgYSBjb2RlIGJsb2NrLCBza2lwXHJcbiAgICAgIGlmIChsaW5lLmluZGV4T2YoXCJgYGBcIikgPT09IDApIHtcclxuICAgICAgICBpc19jb2RlID0gIWlzX2NvZGU7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuICAgICAgLy8gaWYgY2hhcl9hY2N1bSBpcyBncmVhdGVyIHRoYW4gbGltaXQubWF4X2NoYXJzLCBza2lwXHJcbiAgICAgIGlmIChsaW1pdHMubWF4X2NoYXJzICYmIGNoYXJfYWNjdW0gPiBsaW1pdHMubWF4X2NoYXJzKSB7XHJcbiAgICAgICAgZmlyc3RfdGVuX2xpbmVzLnB1c2goXCIuLi5cIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGlzX2NvZGUpIHtcclxuICAgICAgICAvLyBpZiBpcyBjb2RlLCBhZGQgdGFiIHRvIGJlZ2lubmluZyBvZiBsaW5lXHJcbiAgICAgICAgbGluZSA9IFwiXFx0XCIgKyBsaW5lO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGlmIGxpbmUgaXMgYSBoZWFkaW5nXHJcbiAgICAgIGlmIChsaW5lX2lzX2hlYWRpbmcobGluZSkpIHtcclxuICAgICAgICAvLyBsb29rIGF0IGxhc3QgbGluZSBpbiBmaXJzdF90ZW5fbGluZXMgdG8gc2VlIGlmIGl0IGlzIGEgaGVhZGluZ1xyXG4gICAgICAgIC8vIG5vdGU6IHVzZXMgbGFzdCBpbiBmaXJzdF90ZW5fbGluZXMsIGluc3RlYWQgb2YgbG9vayBhaGVhZCBpbiBmaWxlX2xpbmVzLCBiZWNhdXNlLi5cclxuICAgICAgICAvLyAuLi5uZXh0IGxpbmUgbWF5IGJlIGV4Y2x1ZGVkIGZyb20gZmlyc3RfdGVuX2xpbmVzIGJ5IHByZXZpb3VzIGlmIHN0YXRlbWVudHNcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICBmaXJzdF90ZW5fbGluZXMubGVuZ3RoID4gMCAmJlxyXG4gICAgICAgICAgbGluZV9pc19oZWFkaW5nKGZpcnN0X3Rlbl9saW5lc1tmaXJzdF90ZW5fbGluZXMubGVuZ3RoIC0gMV0pXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICAvLyBpZiBsYXN0IGxpbmUgaXMgYSBoZWFkaW5nLCByZW1vdmUgaXRcclxuICAgICAgICAgIGZpcnN0X3Rlbl9saW5lcy5wb3AoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgLy8gYWRkIGxpbmUgdG8gZmlyc3RfdGVuX2xpbmVzXHJcbiAgICAgIGZpcnN0X3Rlbl9saW5lcy5wdXNoKGxpbmUpO1xyXG4gICAgICAvLyBpbmNyZW1lbnQgY2hhcl9hY2N1bVxyXG4gICAgICBjaGFyX2FjY3VtICs9IGxpbmUubGVuZ3RoO1xyXG4gICAgfVxyXG4gICAgLy8gZm9yIGVhY2ggbGluZSBpbiBmaXJzdF90ZW5fbGluZXMsIGFwcGx5IHZpZXctc3BlY2lmaWMgZm9ybWF0dGluZ1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaXJzdF90ZW5fbGluZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgLy8gaWYgbGluZSBpcyBhIGhlYWRpbmdcclxuICAgICAgaWYgKGxpbmVfaXNfaGVhZGluZyhmaXJzdF90ZW5fbGluZXNbaV0pKSB7XHJcbiAgICAgICAgLy8gaWYgdGhpcyBpcyB0aGUgbGFzdCBsaW5lIGluIGZpcnN0X3Rlbl9saW5lc1xyXG4gICAgICAgIGlmIChpID09PSBmaXJzdF90ZW5fbGluZXMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgLy8gcmVtb3ZlIHRoZSBsYXN0IGxpbmUgaWYgaXQgaXMgYSBoZWFkaW5nXHJcbiAgICAgICAgICBmaXJzdF90ZW5fbGluZXMucG9wKCk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gcmVtb3ZlIGhlYWRpbmcgc3ludGF4IHRvIGltcHJvdmUgcmVhZGFiaWxpdHkgaW4gc21hbGwgc3BhY2VcclxuICAgICAgICBmaXJzdF90ZW5fbGluZXNbaV0gPSBmaXJzdF90ZW5fbGluZXNbaV0ucmVwbGFjZSgvIysvLCBcIlwiKTtcclxuICAgICAgICBmaXJzdF90ZW5fbGluZXNbaV0gPSBgXFxuJHtmaXJzdF90ZW5fbGluZXNbaV19OmA7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIGpvaW4gZmlyc3QgdGVuIGxpbmVzIGludG8gc3RyaW5nXHJcbiAgICBmaXJzdF90ZW5fbGluZXMgPSBmaXJzdF90ZW5fbGluZXMuam9pbihcIlxcblwiKTtcclxuICAgIHJldHVybiBmaXJzdF90ZW5fbGluZXM7XHJcbiAgfVxyXG5cclxuICAvLyBpdGVyYXRlIHRocm91Z2ggYmxvY2tzIGFuZCBza2lwIGlmIGJsb2NrX2hlYWRpbmdzIGNvbnRhaW5zIHRoaXMuaGVhZGVyX2V4Y2x1c2lvbnNcclxuICB2YWxpZGF0ZV9oZWFkaW5ncyhibG9ja19oZWFkaW5ncykge1xyXG4gICAgbGV0IHZhbGlkID0gdHJ1ZTtcclxuICAgIGlmICh0aGlzLmhlYWRlcl9leGNsdXNpb25zLmxlbmd0aCA+IDApIHtcclxuICAgICAgZm9yIChsZXQgayA9IDA7IGsgPCB0aGlzLmhlYWRlcl9leGNsdXNpb25zLmxlbmd0aDsgaysrKSB7XHJcbiAgICAgICAgaWYgKGJsb2NrX2hlYWRpbmdzLmluZGV4T2YodGhpcy5oZWFkZXJfZXhjbHVzaW9uc1trXSkgPiAtMSkge1xyXG4gICAgICAgICAgdmFsaWQgPSBmYWxzZTtcclxuICAgICAgICAgIHRoaXMubG9nX2V4Y2x1c2lvbihcImhlYWRpbmc6IFwiICsgdGhpcy5oZWFkZXJfZXhjbHVzaW9uc1trXSk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiB2YWxpZDtcclxuICB9XHJcbiAgLy8gcmVuZGVyIFwiU21hcnQgQ29ubmVjdGlvbnNcIiB0ZXh0IGZpeGVkIGluIHRoZSBib3R0b20gcmlnaHQgY29ybmVyXHJcbiAgcmVuZGVyX2JyYW5kKGNvbnRhaW5lciwgbG9jYXRpb24gPSBcImRlZmF1bHRcIikge1xyXG4gICAgLy8gaWYgbG9jYXRpb24gaXMgYWxsIHRoZW4gZ2V0IE9iamVjdC5rZXlzKHRoaXMuc2NfYnJhbmRpbmcpIGFuZCBjYWxsIHRoaXMgZnVuY3Rpb24gZm9yIGVhY2hcclxuICAgIGlmIChjb250YWluZXIgPT09IFwiYWxsXCIpIHtcclxuICAgICAgY29uc3QgbG9jYXRpb25zID0gT2JqZWN0LmtleXModGhpcy5zY19icmFuZGluZyk7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbG9jYXRpb25zLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJfYnJhbmQodGhpcy5zY19icmFuZGluZ1tsb2NhdGlvbnNbaV1dLCBsb2NhdGlvbnNbaV0pO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIC8vIGJyYW5kIGNvbnRhaW5lclxyXG4gICAgdGhpcy5zY19icmFuZGluZ1tsb2NhdGlvbl0gPSBjb250YWluZXI7XHJcbiAgICAvLyBpZiB0aGlzLnNjX2JyYW5kaW5nW2xvY2F0aW9uXSBjb250YWlucyBjaGlsZCB3aXRoIGNsYXNzIFwic2MtYnJhbmRcIiwgcmVtb3ZlIGl0XHJcbiAgICBpZiAodGhpcy5zY19icmFuZGluZ1tsb2NhdGlvbl0ucXVlcnlTZWxlY3RvcihcIi5zYy1icmFuZFwiKSkge1xyXG4gICAgICB0aGlzLnNjX2JyYW5kaW5nW2xvY2F0aW9uXS5xdWVyeVNlbGVjdG9yKFwiLnNjLWJyYW5kXCIpLnJlbW92ZSgpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgYnJhbmRfY29udGFpbmVyID0gdGhpcy5zY19icmFuZGluZ1tsb2NhdGlvbl0uY3JlYXRlRWwoXCJkaXZcIiwge1xyXG4gICAgICBjbHM6IFwic2MtYnJhbmRcIixcclxuICAgIH0pO1xyXG4gICAgLy8gYWRkIHRleHRcclxuICAgIC8vIGFkZCBTVkcgc2lnbmFsIGljb24gdXNpbmcgZ2V0SWNvblxyXG4gICAgT2JzaWRpYW4uc2V0SWNvbihicmFuZF9jb250YWluZXIsIFwic21hcnQtY29ubmVjdGlvbnNcIik7XHJcbiAgICBjb25zdCBicmFuZF9wID0gYnJhbmRfY29udGFpbmVyLmNyZWF0ZUVsKFwicFwiKTtcclxuICAgIGxldCB0ZXh0ID0gXCJTbWFydCBDb25uZWN0aW9uc1wiO1xyXG4gICAgbGV0IGF0dHIgPSB7fTtcclxuICAgIC8vIGlmIHVwZGF0ZSBhdmFpbGFibGUsIGNoYW5nZSB0ZXh0IHRvIFwiVXBkYXRlIEF2YWlsYWJsZVwiXHJcbiAgICBpZiAodGhpcy51cGRhdGVfYXZhaWxhYmxlKSB7XHJcbiAgICAgIHRleHQgPSBcIlVwZGF0ZSBBdmFpbGFibGVcIjtcclxuICAgICAgYXR0ciA9IHtcclxuICAgICAgICBzdHlsZTogXCJmb250LXdlaWdodDogNzAwO1wiLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgYnJhbmRfcC5jcmVhdGVFbChcImFcIiwge1xyXG4gICAgICBjbHM6IFwiXCIsXHJcbiAgICAgIHRleHQ6IHRleHQsXHJcbiAgICAgIGhyZWY6IFwiaHR0cHM6Ly9naXRodWIuY29tL2JyaWFucGV0cm8vb2JzaWRpYW4tc21hcnQtY29ubmVjdGlvbnMvZGlzY3Vzc2lvbnNcIixcclxuICAgICAgdGFyZ2V0OiBcIl9ibGFua1wiLFxyXG4gICAgICBhdHRyOiBhdHRyLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyBjcmVhdGUgbGlzdCBvZiBuZWFyZXN0IG5vdGVzXHJcbiAgYXN5bmMgdXBkYXRlX3Jlc3VsdHMoY29udGFpbmVyLCBuZWFyZXN0KSB7XHJcbiAgICBsZXQgbGlzdDtcclxuICAgIC8vIGNoZWNrIGlmIGxpc3QgZXhpc3RzXHJcbiAgICBpZiAoXHJcbiAgICAgIGNvbnRhaW5lci5jaGlsZHJlbi5sZW5ndGggPiAxICYmXHJcbiAgICAgIGNvbnRhaW5lci5jaGlsZHJlblsxXS5jbGFzc0xpc3QuY29udGFpbnMoXCJzYy1saXN0XCIpXHJcbiAgICApIHtcclxuICAgICAgbGlzdCA9IGNvbnRhaW5lci5jaGlsZHJlblsxXTtcclxuICAgIH1cclxuICAgIC8vIGlmIGxpc3QgZXhpc3RzLCBlbXB0eSBpdFxyXG4gICAgaWYgKGxpc3QpIHtcclxuICAgICAgbGlzdC5lbXB0eSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gY3JlYXRlIGxpc3QgZWxlbWVudFxyXG4gICAgICBsaXN0ID0gY29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcInNjLWxpc3RcIiB9KTtcclxuICAgIH1cclxuICAgIGxldCBzZWFyY2hfcmVzdWx0X2NsYXNzID0gXCJzZWFyY2gtcmVzdWx0XCI7XHJcbiAgICAvLyBpZiBzZXR0aW5ncyBleHBhbmRlZF92aWV3IGlzIGZhbHNlLCBhZGQgc2MtY29sbGFwc2VkIGNsYXNzXHJcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZXhwYW5kZWRfdmlldykgc2VhcmNoX3Jlc3VsdF9jbGFzcyArPSBcIiBzYy1jb2xsYXBzZWRcIjtcclxuXHJcbiAgICAvLyBUT0RPOiBhZGQgb3B0aW9uIHRvIGdyb3VwIG5lYXJlc3QgYnkgZmlsZVxyXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmdyb3VwX25lYXJlc3RfYnlfZmlsZSkge1xyXG4gICAgICAvLyBmb3IgZWFjaCBuZWFyZXN0IG5vdGVcclxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuZWFyZXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgICogQkVHSU4gRVhURVJOQUwgTElOSyBMT0dJQ1xyXG4gICAgICAgICAqIGlmIGxpbmsgaXMgYW4gb2JqZWN0LCBpdCBpbmRpY2F0ZXMgZXh0ZXJuYWwgbGlua1xyXG4gICAgICAgICAqL1xyXG4gICAgICAgIGlmICh0eXBlb2YgbmVhcmVzdFtpXS5saW5rID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgICBjb25zdCBpdGVtID0gbGlzdC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJzZWFyY2gtcmVzdWx0XCIgfSk7XHJcbiAgICAgICAgICBjb25zdCBsaW5rID0gaXRlbS5jcmVhdGVFbChcImFcIiwge1xyXG4gICAgICAgICAgICBjbHM6IFwic2VhcmNoLXJlc3VsdC1maWxlLXRpdGxlIGlzLWNsaWNrYWJsZVwiLFxyXG4gICAgICAgICAgICBocmVmOiBuZWFyZXN0W2ldLmxpbmsucGF0aCxcclxuICAgICAgICAgICAgdGl0bGU6IG5lYXJlc3RbaV0ubGluay50aXRsZSxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgbGluay5pbm5lckhUTUwgPSB0aGlzLnJlbmRlcl9leHRlcm5hbF9saW5rX2VsbShuZWFyZXN0W2ldLmxpbmspO1xyXG4gICAgICAgICAgaXRlbS5zZXRBdHRyKFwiZHJhZ2dhYmxlXCIsIFwidHJ1ZVwiKTtcclxuICAgICAgICAgIGNvbnRpbnVlOyAvLyBlbmRzIGhlcmUgZm9yIGV4dGVybmFsIGxpbmtzXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8qKlxyXG4gICAgICAgICAqIEJFR0lOIElOVEVSTkFMIExJTksgTE9HSUNcclxuICAgICAgICAgKiBpZiBsaW5rIGlzIGEgc3RyaW5nLCBpdCBpbmRpY2F0ZXMgaW50ZXJuYWwgbGlua1xyXG4gICAgICAgICAqL1xyXG4gICAgICAgIGxldCBmaWxlX2xpbmtfdGV4dDtcclxuICAgICAgICBjb25zdCBmaWxlX3NpbWlsYXJpdHlfcGN0ID1cclxuICAgICAgICAgIE1hdGgucm91bmQobmVhcmVzdFtpXS5zaW1pbGFyaXR5ICogMTAwKSArIFwiJVwiO1xyXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLnNob3dfZnVsbF9wYXRoKSB7XHJcbiAgICAgICAgICBjb25zdCBwY3MgPSBuZWFyZXN0W2ldLmxpbmsuc3BsaXQoXCIvXCIpO1xyXG4gICAgICAgICAgZmlsZV9saW5rX3RleHQgPSBwY3NbcGNzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgY29uc3QgcGF0aCA9IHBjcy5zbGljZSgwLCBwY3MubGVuZ3RoIC0gMSkuam9pbihcIi9cIik7XHJcbiAgICAgICAgICAvLyBmaWxlX2xpbmtfdGV4dCA9IGA8c21hbGw+JHtwYXRofSB8ICR7ZmlsZV9zaW1pbGFyaXR5X3BjdH08L3NtYWxsPjxicj4ke2ZpbGVfbGlua190ZXh0fWA7XHJcbiAgICAgICAgICBmaWxlX2xpbmtfdGV4dCA9IGA8c21hbGw+JHtmaWxlX3NpbWlsYXJpdHlfcGN0fSB8ICR7cGF0aH0gfCAke2ZpbGVfbGlua190ZXh0fTwvc21hbGw+YDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgZmlsZV9saW5rX3RleHQgPVxyXG4gICAgICAgICAgICBcIjxzbWFsbD5cIiArXHJcbiAgICAgICAgICAgIGZpbGVfc2ltaWxhcml0eV9wY3QgK1xyXG4gICAgICAgICAgICBcIiB8IFwiICtcclxuICAgICAgICAgICAgbmVhcmVzdFtpXS5saW5rLnNwbGl0KFwiL1wiKS5wb3AoKSArXHJcbiAgICAgICAgICAgIFwiPC9zbWFsbD5cIjtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gc2tpcCBjb250ZW50cyByZW5kZXJpbmcgaWYgaW5jb21wYXRpYmxlIGZpbGUgdHlwZVxyXG4gICAgICAgIC8vIGV4LiBub3QgbWFya2Rvd24gZmlsZSBvciBjb250YWlucyBubyAnLmV4Y2FsaWRyYXcnXHJcbiAgICAgICAgaWYgKCF0aGlzLnJlbmRlcmFibGVfZmlsZV90eXBlKG5lYXJlc3RbaV0ubGluaykpIHtcclxuICAgICAgICAgIGNvbnN0IGl0ZW0gPSBsaXN0LmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcInNlYXJjaC1yZXN1bHRcIiB9KTtcclxuICAgICAgICAgIGNvbnN0IGxpbmsgPSBpdGVtLmNyZWF0ZUVsKFwiYVwiLCB7XHJcbiAgICAgICAgICAgIGNsczogXCJzZWFyY2gtcmVzdWx0LWZpbGUtdGl0bGUgaXMtY2xpY2thYmxlXCIsXHJcbiAgICAgICAgICAgIGhyZWY6IG5lYXJlc3RbaV0ubGluayxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgbGluay5pbm5lckhUTUwgPSBmaWxlX2xpbmtfdGV4dDtcclxuICAgICAgICAgIC8vIGRyYWcgYW5kIGRyb3BcclxuICAgICAgICAgIGl0ZW0uc2V0QXR0cihcImRyYWdnYWJsZVwiLCBcInRydWVcIik7XHJcbiAgICAgICAgICAvLyBhZGQgbGlzdGVuZXJzIHRvIGxpbmtcclxuICAgICAgICAgIHRoaXMuYWRkX2xpbmtfbGlzdGVuZXJzKGxpbmssIG5lYXJlc3RbaV0sIGl0ZW0pO1xyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyByZW1vdmUgZmlsZSBleHRlbnNpb24gaWYgLm1kIGFuZCBtYWtlICMgaW50byA+XHJcbiAgICAgICAgZmlsZV9saW5rX3RleHQgPSBmaWxlX2xpbmtfdGV4dC5yZXBsYWNlKFwiLm1kXCIsIFwiXCIpLnJlcGxhY2UoLyMvZywgXCIgPiBcIik7XHJcbiAgICAgICAgLy8gY3JlYXRlIGl0ZW1cclxuICAgICAgICBjb25zdCBpdGVtID0gbGlzdC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogc2VhcmNoX3Jlc3VsdF9jbGFzcyB9KTtcclxuICAgICAgICAvLyBjcmVhdGUgc3BhbiBmb3IgdG9nZ2xlXHJcbiAgICAgICAgY29uc3QgdG9nZ2xlID0gaXRlbS5jcmVhdGVFbChcInNwYW5cIiwgeyBjbHM6IFwiaXMtY2xpY2thYmxlXCIgfSk7XHJcbiAgICAgICAgLy8gaW5zZXJ0IHJpZ2h0IHRyaWFuZ2xlIHN2ZyBhcyB0b2dnbGVcclxuICAgICAgICBPYnNpZGlhbi5zZXRJY29uKHRvZ2dsZSwgXCJyaWdodC10cmlhbmdsZVwiKTsgLy8gbXVzdCBjb21lIGJlZm9yZSBhZGRpbmcgb3RoZXIgZWxtcyB0byBwcmV2ZW50IG92ZXJ3cml0ZVxyXG4gICAgICAgIGNvbnN0IGxpbmsgPSB0b2dnbGUuY3JlYXRlRWwoXCJhXCIsIHtcclxuICAgICAgICAgIGNsczogXCJzZWFyY2gtcmVzdWx0LWZpbGUtdGl0bGVcIixcclxuICAgICAgICAgIHRpdGxlOiBuZWFyZXN0W2ldLmxpbmssXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgbGluay5pbm5lckhUTUwgPSBmaWxlX2xpbmtfdGV4dDtcclxuICAgICAgICAvLyBhZGQgbGlzdGVuZXJzIHRvIGxpbmtcclxuICAgICAgICB0aGlzLmFkZF9saW5rX2xpc3RlbmVycyhsaW5rLCBuZWFyZXN0W2ldLCBpdGVtKTtcclxuICAgICAgICB0b2dnbGUuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgLy8gZmluZCBwYXJlbnQgY29udGFpbmluZyBzZWFyY2gtcmVzdWx0IGNsYXNzXHJcbiAgICAgICAgICBsZXQgcGFyZW50ID0gZXZlbnQudGFyZ2V0LnBhcmVudEVsZW1lbnQ7XHJcbiAgICAgICAgICB3aGlsZSAoIXBhcmVudC5jbGFzc0xpc3QuY29udGFpbnMoXCJzZWFyY2gtcmVzdWx0XCIpKSB7XHJcbiAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgLy8gdG9nZ2xlIHNjLWNvbGxhcHNlZCBjbGFzc1xyXG4gICAgICAgICAgcGFyZW50LmNsYXNzTGlzdC50b2dnbGUoXCJzYy1jb2xsYXBzZWRcIik7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgY29udGVudHMgPSBpdGVtLmNyZWF0ZUVsKFwidWxcIiwgeyBjbHM6IFwiXCIgfSk7XHJcbiAgICAgICAgY29uc3QgY29udGVudHNfY29udGFpbmVyID0gY29udGVudHMuY3JlYXRlRWwoXCJsaVwiLCB7XHJcbiAgICAgICAgICBjbHM6IFwic2VhcmNoLXJlc3VsdC1maWxlLXRpdGxlIGlzLWNsaWNrYWJsZVwiLFxyXG4gICAgICAgICAgdGl0bGU6IG5lYXJlc3RbaV0ubGluayxcclxuICAgICAgICB9KTtcclxuICAgICAgICBpZiAobmVhcmVzdFtpXS5saW5rLmluZGV4T2YoXCIjXCIpID4gLTEpIHtcclxuICAgICAgICAgIC8vIGlzIGJsb2NrXHJcbiAgICAgICAgICBPYnNpZGlhbi5NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKFxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmJsb2NrX3JldHJpZXZlcihuZWFyZXN0W2ldLmxpbmssIHtcclxuICAgICAgICAgICAgICBsaW5lczogMTAsXHJcbiAgICAgICAgICAgICAgbWF4X2NoYXJzOiAxMDAwLFxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgY29udGVudHNfY29udGFpbmVyLFxyXG4gICAgICAgICAgICBuZWFyZXN0W2ldLmxpbmssXHJcbiAgICAgICAgICAgIG5ldyBPYnNpZGlhbi5Db21wb25lbnQoKVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8gaXMgZmlsZVxyXG4gICAgICAgICAgY29uc3QgZmlyc3RfdGVuX2xpbmVzID0gYXdhaXQgdGhpcy5maWxlX3JldHJpZXZlcihuZWFyZXN0W2ldLmxpbmssIHtcclxuICAgICAgICAgICAgbGluZXM6IDEwLFxyXG4gICAgICAgICAgICBtYXhfY2hhcnM6IDEwMDAsXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGlmICghZmlyc3RfdGVuX2xpbmVzKSBjb250aW51ZTsgLy8gc2tpcCBpZiBmaWxlIGlzIGVtcHR5XHJcbiAgICAgICAgICBPYnNpZGlhbi5NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKFxyXG4gICAgICAgICAgICBmaXJzdF90ZW5fbGluZXMsXHJcbiAgICAgICAgICAgIGNvbnRlbnRzX2NvbnRhaW5lcixcclxuICAgICAgICAgICAgbmVhcmVzdFtpXS5saW5rLFxyXG4gICAgICAgICAgICBuZXcgT2JzaWRpYW4uQ29tcG9uZW50KClcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYWRkX2xpbmtfbGlzdGVuZXJzKGNvbnRlbnRzLCBuZWFyZXN0W2ldLCBpdGVtKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLnJlbmRlcl9icmFuZChjb250YWluZXIsIFwiYmxvY2tcIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBncm91cCBuZWFyZXN0IGJ5IGZpbGVcclxuICAgIGNvbnN0IG5lYXJlc3RfYnlfZmlsZSA9IHt9O1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuZWFyZXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IGN1cnIgPSBuZWFyZXN0W2ldO1xyXG4gICAgICBjb25zdCBsaW5rID0gY3Vyci5saW5rO1xyXG4gICAgICAvLyBza2lwIGlmIGxpbmsgaXMgYW4gb2JqZWN0IChpbmRpY2F0ZXMgZXh0ZXJuYWwgbG9naWMpXHJcbiAgICAgIGlmICh0eXBlb2YgbGluayA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICAgIG5lYXJlc3RfYnlfZmlsZVtsaW5rLnBhdGhdID0gW2N1cnJdO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChsaW5rLmluZGV4T2YoXCIjXCIpID4gLTEpIHtcclxuICAgICAgICBjb25zdCBmaWxlX3BhdGggPSBsaW5rLnNwbGl0KFwiI1wiKVswXTtcclxuICAgICAgICBpZiAoIW5lYXJlc3RfYnlfZmlsZVtmaWxlX3BhdGhdKSB7XHJcbiAgICAgICAgICBuZWFyZXN0X2J5X2ZpbGVbZmlsZV9wYXRoXSA9IFtdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBuZWFyZXN0X2J5X2ZpbGVbZmlsZV9wYXRoXS5wdXNoKG5lYXJlc3RbaV0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlmICghbmVhcmVzdF9ieV9maWxlW2xpbmtdKSB7XHJcbiAgICAgICAgICBuZWFyZXN0X2J5X2ZpbGVbbGlua10gPSBbXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gYWx3YXlzIGFkZCB0byBmcm9udCBvZiBhcnJheVxyXG4gICAgICAgIG5lYXJlc3RfYnlfZmlsZVtsaW5rXS51bnNoaWZ0KG5lYXJlc3RbaV0pO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICAvLyBmb3IgZWFjaCBmaWxlXHJcbiAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMobmVhcmVzdF9ieV9maWxlKTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICBjb25zdCBmaWxlID0gbmVhcmVzdF9ieV9maWxlW2tleXNbaV1dO1xyXG4gICAgICAvKipcclxuICAgICAgICogQmVnaW4gZXh0ZXJuYWwgbGluayBoYW5kbGluZ1xyXG4gICAgICAgKi9cclxuICAgICAgLy8gaWYgbGluayBpcyBhbiBvYmplY3QgKGluZGljYXRlcyB2MiBsb2dpYylcclxuICAgICAgaWYgKHR5cGVvZiBmaWxlWzBdLmxpbmsgPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICBjb25zdCBjdXJyID0gZmlsZVswXTtcclxuICAgICAgICBjb25zdCBtZXRhID0gY3Vyci5saW5rO1xyXG4gICAgICAgIGlmIChtZXRhLnBhdGguc3RhcnRzV2l0aChcImh0dHBcIikpIHtcclxuICAgICAgICAgIGNvbnN0IGl0ZW0gPSBsaXN0LmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcInNlYXJjaC1yZXN1bHRcIiB9KTtcclxuICAgICAgICAgIGNvbnN0IGxpbmsgPSBpdGVtLmNyZWF0ZUVsKFwiYVwiLCB7XHJcbiAgICAgICAgICAgIGNsczogXCJzZWFyY2gtcmVzdWx0LWZpbGUtdGl0bGUgaXMtY2xpY2thYmxlXCIsXHJcbiAgICAgICAgICAgIGhyZWY6IG1ldGEucGF0aCxcclxuICAgICAgICAgICAgdGl0bGU6IG1ldGEudGl0bGUsXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGxpbmsuaW5uZXJIVE1MID0gdGhpcy5yZW5kZXJfZXh0ZXJuYWxfbGlua19lbG0obWV0YSk7XHJcbiAgICAgICAgICBpdGVtLnNldEF0dHIoXCJkcmFnZ2FibGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICAgICAgY29udGludWU7IC8vIGVuZHMgaGVyZSBmb3IgZXh0ZXJuYWwgbGlua3NcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgLyoqXHJcbiAgICAgICAqIEhhbmRsZXMgSW50ZXJuYWxcclxuICAgICAgICovXHJcbiAgICAgIGxldCBmaWxlX2xpbmtfdGV4dDtcclxuICAgICAgY29uc3QgZmlsZV9zaW1pbGFyaXR5X3BjdCA9IE1hdGgucm91bmQoZmlsZVswXS5zaW1pbGFyaXR5ICogMTAwKSArIFwiJVwiO1xyXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5zaG93X2Z1bGxfcGF0aCkge1xyXG4gICAgICAgIGNvbnN0IHBjcyA9IGZpbGVbMF0ubGluay5zcGxpdChcIi9cIik7XHJcbiAgICAgICAgZmlsZV9saW5rX3RleHQgPSBwY3NbcGNzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIGNvbnN0IHBhdGggPSBwY3Muc2xpY2UoMCwgcGNzLmxlbmd0aCAtIDEpLmpvaW4oXCIvXCIpO1xyXG4gICAgICAgIGZpbGVfbGlua190ZXh0ID0gYDxzbWFsbD4ke3BhdGh9IHwgJHtmaWxlX3NpbWlsYXJpdHlfcGN0fTwvc21hbGw+PGJyPiR7ZmlsZV9saW5rX3RleHR9YDtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBmaWxlX2xpbmtfdGV4dCA9IGZpbGVbMF0ubGluay5zcGxpdChcIi9cIikucG9wKCk7XHJcbiAgICAgICAgLy8gYWRkIHNpbWlsYXJpdHkgcGVyY2VudGFnZVxyXG4gICAgICAgIGZpbGVfbGlua190ZXh0ICs9IFwiIHwgXCIgKyBmaWxlX3NpbWlsYXJpdHlfcGN0O1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBza2lwIGNvbnRlbnRzIHJlbmRlcmluZyBpZiBpbmNvbXBhdGlibGUgZmlsZSB0eXBlXHJcbiAgICAgIC8vIGV4LiBub3QgbWFya2Rvd24gb3IgY29udGFpbnMgJy5leGNhbGlkcmF3J1xyXG4gICAgICBpZiAoIXRoaXMucmVuZGVyYWJsZV9maWxlX3R5cGUoZmlsZVswXS5saW5rKSkge1xyXG4gICAgICAgIGNvbnN0IGl0ZW0gPSBsaXN0LmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcInNlYXJjaC1yZXN1bHRcIiB9KTtcclxuICAgICAgICBjb25zdCBmaWxlX2xpbmsgPSBpdGVtLmNyZWF0ZUVsKFwiYVwiLCB7XHJcbiAgICAgICAgICBjbHM6IFwic2VhcmNoLXJlc3VsdC1maWxlLXRpdGxlIGlzLWNsaWNrYWJsZVwiLFxyXG4gICAgICAgICAgdGl0bGU6IGZpbGVbMF0ubGluayxcclxuICAgICAgICB9KTtcclxuICAgICAgICBmaWxlX2xpbmsuaW5uZXJIVE1MID0gZmlsZV9saW5rX3RleHQ7XHJcbiAgICAgICAgLy8gYWRkIGxpbmsgbGlzdGVuZXJzIHRvIGZpbGUgbGlua1xyXG4gICAgICAgIHRoaXMuYWRkX2xpbmtfbGlzdGVuZXJzKGZpbGVfbGluaywgZmlsZVswXSwgaXRlbSk7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIHJlbW92ZSBmaWxlIGV4dGVuc2lvbiBpZiAubWRcclxuICAgICAgZmlsZV9saW5rX3RleHQgPSBmaWxlX2xpbmtfdGV4dC5yZXBsYWNlKFwiLm1kXCIsIFwiXCIpLnJlcGxhY2UoLyMvZywgXCIgPiBcIik7XHJcbiAgICAgIGNvbnN0IGl0ZW0gPSBsaXN0LmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBzZWFyY2hfcmVzdWx0X2NsYXNzIH0pO1xyXG4gICAgICBjb25zdCB0b2dnbGUgPSBpdGVtLmNyZWF0ZUVsKFwic3BhblwiLCB7IGNsczogXCJpcy1jbGlja2FibGVcIiB9KTtcclxuICAgICAgLy8gaW5zZXJ0IHJpZ2h0IHRyaWFuZ2xlIHN2ZyBpY29uIGFzIHRvZ2dsZSBidXR0b24gaW4gc3BhblxyXG4gICAgICBPYnNpZGlhbi5zZXRJY29uKHRvZ2dsZSwgXCJyaWdodC10cmlhbmdsZVwiKTsgLy8gbXVzdCBjb21lIGJlZm9yZSBhZGRpbmcgb3RoZXIgZWxtcyBlbHNlIG92ZXJ3cml0ZXNcclxuICAgICAgY29uc3QgZmlsZV9saW5rID0gdG9nZ2xlLmNyZWF0ZUVsKFwiYVwiLCB7XHJcbiAgICAgICAgY2xzOiBcInNlYXJjaC1yZXN1bHQtZmlsZS10aXRsZVwiLFxyXG4gICAgICAgIHRpdGxlOiBmaWxlWzBdLmxpbmssXHJcbiAgICAgIH0pO1xyXG4gICAgICBmaWxlX2xpbmsuaW5uZXJIVE1MID0gZmlsZV9saW5rX3RleHQ7XHJcbiAgICAgIC8vIGFkZCBsaW5rIGxpc3RlbmVycyB0byBmaWxlIGxpbmtcclxuICAgICAgdGhpcy5hZGRfbGlua19saXN0ZW5lcnMoZmlsZV9saW5rLCBmaWxlWzBdLCB0b2dnbGUpO1xyXG4gICAgICB0b2dnbGUuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xyXG4gICAgICAgIC8vIGZpbmQgcGFyZW50IGNvbnRhaW5pbmcgY2xhc3Mgc2VhcmNoLXJlc3VsdFxyXG4gICAgICAgIGxldCBwYXJlbnQgPSBldmVudC50YXJnZXQ7XHJcbiAgICAgICAgd2hpbGUgKCFwYXJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKFwic2VhcmNoLXJlc3VsdFwiKSkge1xyXG4gICAgICAgICAgcGFyZW50ID0gcGFyZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHBhcmVudC5jbGFzc0xpc3QudG9nZ2xlKFwic2MtY29sbGFwc2VkXCIpO1xyXG4gICAgICAgIC8vIFRPRE86IGlmIGJsb2NrIGNvbnRhaW5lciBpcyBlbXB0eSwgcmVuZGVyIG1hcmtkb3duIGZyb20gYmxvY2sgcmV0cmlldmVyXHJcbiAgICAgIH0pO1xyXG4gICAgICBjb25zdCBmaWxlX2xpbmtfbGlzdCA9IGl0ZW0uY3JlYXRlRWwoXCJ1bFwiKTtcclxuICAgICAgLy8gZm9yIGVhY2ggbGluayBpbiBmaWxlXHJcbiAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZmlsZS5sZW5ndGg7IGorKykge1xyXG4gICAgICAgIC8vIGlmIGlzIGEgYmxvY2sgKGhhcyAjIGluIGxpbmspXHJcbiAgICAgICAgaWYgKGZpbGVbal0ubGluay5pbmRleE9mKFwiI1wiKSA+IC0xKSB7XHJcbiAgICAgICAgICBjb25zdCBibG9jayA9IGZpbGVbal07XHJcbiAgICAgICAgICBjb25zdCBibG9ja19saW5rID0gZmlsZV9saW5rX2xpc3QuY3JlYXRlRWwoXCJsaVwiLCB7XHJcbiAgICAgICAgICAgIGNsczogXCJzZWFyY2gtcmVzdWx0LWZpbGUtdGl0bGUgaXMtY2xpY2thYmxlXCIsXHJcbiAgICAgICAgICAgIHRpdGxlOiBibG9jay5saW5rLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICAvLyBza2lwIGJsb2NrIGNvbnRleHQgaWYgZmlsZS5sZW5ndGggPT09IDEgYmVjYXVzZSBhbHJlYWR5IGFkZGVkXHJcbiAgICAgICAgICBpZiAoZmlsZS5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJsb2NrX2NvbnRleHQgPSB0aGlzLnJlbmRlcl9ibG9ja19jb250ZXh0KGJsb2NrKTtcclxuICAgICAgICAgICAgY29uc3QgYmxvY2tfc2ltaWxhcml0eV9wY3QgPVxyXG4gICAgICAgICAgICAgIE1hdGgucm91bmQoYmxvY2suc2ltaWxhcml0eSAqIDEwMCkgKyBcIiVcIjtcclxuICAgICAgICAgICAgYmxvY2tfbGluay5pbm5lckhUTUwgPSBgPHNtYWxsPiR7YmxvY2tfY29udGV4dH0gfCAke2Jsb2NrX3NpbWlsYXJpdHlfcGN0fTwvc21hbGw+YDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGNvbnN0IGJsb2NrX2NvbnRhaW5lciA9IGJsb2NrX2xpbmsuY3JlYXRlRWwoXCJkaXZcIik7XHJcbiAgICAgICAgICAvLyBUT0RPOiBtb3ZlIHRvIHJlbmRlcmluZyBvbiBleHBhbmRpbmcgc2VjdGlvbiAodG9nZ2xlIGNvbGxhcHNlZClcclxuICAgICAgICAgIE9ic2lkaWFuLk1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oXHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYmxvY2tfcmV0cmlldmVyKGJsb2NrLmxpbmssIHtcclxuICAgICAgICAgICAgICBsaW5lczogMTAsXHJcbiAgICAgICAgICAgICAgbWF4X2NoYXJzOiAxMDAwLFxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgYmxvY2tfY29udGFpbmVyLFxyXG4gICAgICAgICAgICBibG9jay5saW5rLFxyXG4gICAgICAgICAgICBuZXcgT2JzaWRpYW4uQ29tcG9uZW50KClcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgICAvLyBhZGQgbGluayBsaXN0ZW5lcnMgdG8gYmxvY2sgbGlua1xyXG4gICAgICAgICAgdGhpcy5hZGRfbGlua19saXN0ZW5lcnMoYmxvY2tfbGluaywgYmxvY2ssIGZpbGVfbGlua19saXN0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8gZ2V0IGZpcnN0IHRlbiBsaW5lcyBvZiBmaWxlXHJcbiAgICAgICAgICBjb25zdCBmaWxlX2xpbmtfbGlzdCA9IGl0ZW0uY3JlYXRlRWwoXCJ1bFwiKTtcclxuICAgICAgICAgIGNvbnN0IGJsb2NrX2xpbmsgPSBmaWxlX2xpbmtfbGlzdC5jcmVhdGVFbChcImxpXCIsIHtcclxuICAgICAgICAgICAgY2xzOiBcInNlYXJjaC1yZXN1bHQtZmlsZS10aXRsZSBpcy1jbGlja2FibGVcIixcclxuICAgICAgICAgICAgdGl0bGU6IGZpbGVbMF0ubGluayxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgY29uc3QgYmxvY2tfY29udGFpbmVyID0gYmxvY2tfbGluay5jcmVhdGVFbChcImRpdlwiKTtcclxuICAgICAgICAgIGxldCBmaXJzdF90ZW5fbGluZXMgPSBhd2FpdCB0aGlzLmZpbGVfcmV0cmlldmVyKGZpbGVbMF0ubGluaywge1xyXG4gICAgICAgICAgICBsaW5lczogMTAsXHJcbiAgICAgICAgICAgIG1heF9jaGFyczogMTAwMCxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgaWYgKCFmaXJzdF90ZW5fbGluZXMpIGNvbnRpbnVlOyAvLyBpZiBmaWxlIG5vdCBmb3VuZCwgc2tpcFxyXG4gICAgICAgICAgT2JzaWRpYW4uTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihcclxuICAgICAgICAgICAgZmlyc3RfdGVuX2xpbmVzLFxyXG4gICAgICAgICAgICBibG9ja19jb250YWluZXIsXHJcbiAgICAgICAgICAgIGZpbGVbMF0ubGluayxcclxuICAgICAgICAgICAgbmV3IE9ic2lkaWFuLkNvbXBvbmVudCgpXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgdGhpcy5hZGRfbGlua19saXN0ZW5lcnMoYmxvY2tfbGluaywgZmlsZVswXSwgZmlsZV9saW5rX2xpc3QpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgdGhpcy5yZW5kZXJfYnJhbmQoY29udGFpbmVyLCBcImZpbGVcIik7XHJcbiAgfVxyXG5cclxuICBhZGRfbGlua19saXN0ZW5lcnMoaXRlbSwgY3VyciwgbGlzdCkge1xyXG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGF3YWl0IHRoaXMub3Blbl9ub3RlKGN1cnIsIGV2ZW50KTtcclxuICAgIH0pO1xyXG4gICAgLy8gZHJhZy1vblxyXG4gICAgLy8gY3VycmVudGx5IG9ubHkgd29ya3Mgd2l0aCBmdWxsLWZpbGUgbGlua3NcclxuICAgIGl0ZW0uc2V0QXR0cihcImRyYWdnYWJsZVwiLCBcInRydWVcIik7XHJcbiAgICBpdGVtLmFkZEV2ZW50TGlzdGVuZXIoXCJkcmFnc3RhcnRcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IGRyYWdNYW5hZ2VyID0gdGhpcy5hcHAuZHJhZ01hbmFnZXI7XHJcbiAgICAgIGNvbnN0IGZpbGVfcGF0aCA9IGN1cnIubGluay5zcGxpdChcIiNcIilbMF07XHJcbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KGZpbGVfcGF0aCwgXCJcIik7XHJcbiAgICAgIGNvbnN0IGRyYWdEYXRhID0gZHJhZ01hbmFnZXIuZHJhZ0ZpbGUoZXZlbnQsIGZpbGUpO1xyXG4gICAgICBkcmFnTWFuYWdlci5vbkRyYWdTdGFydChldmVudCwgZHJhZ0RhdGEpO1xyXG4gICAgfSk7XHJcbiAgICAvLyBpZiBjdXJyLmxpbmsgY29udGFpbnMgY3VybHkgYnJhY2VzLCByZXR1cm4gKGluY29tcGF0aWJsZSB3aXRoIGhvdmVyLWxpbmspXHJcbiAgICBpZiAoY3Vyci5saW5rLmluZGV4T2YoXCJ7XCIpID4gLTEpIHJldHVybjtcclxuICAgIC8vIHRyaWdnZXIgaG92ZXIgZXZlbnQgb24gbGlua1xyXG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKFwibW91c2VvdmVyXCIsIChldmVudCkgPT4ge1xyXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2UudHJpZ2dlcihcImhvdmVyLWxpbmtcIiwge1xyXG4gICAgICAgIGV2ZW50LFxyXG4gICAgICAgIHNvdXJjZTogU01BUlRfQ09OTkVDVElPTlNfVklFV19UWVBFLFxyXG4gICAgICAgIGhvdmVyUGFyZW50OiBsaXN0LFxyXG4gICAgICAgIHRhcmdldEVsOiBpdGVtLFxyXG4gICAgICAgIGxpbmt0ZXh0OiBjdXJyLmxpbmssXHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyBnZXQgdGFyZ2V0IGZpbGUgZnJvbSBsaW5rIHBhdGhcclxuICAvLyBpZiBzdWItc2VjdGlvbiBpcyBsaW5rZWQsIG9wZW4gZmlsZSBhbmQgc2Nyb2xsIHRvIHN1Yi1zZWN0aW9uXHJcbiAgYXN5bmMgb3Blbl9ub3RlKGN1cnIsIGV2ZW50ID0gbnVsbCkge1xyXG4gICAgbGV0IHRhcmdldEZpbGU7XHJcbiAgICBsZXQgaGVhZGluZztcclxuICAgIGlmIChjdXJyLmxpbmsuaW5kZXhPZihcIiNcIikgPiAtMSkge1xyXG4gICAgICAvLyByZW1vdmUgYWZ0ZXIgIyBmcm9tIGxpbmtcclxuICAgICAgdGFyZ2V0RmlsZSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Rmlyc3RMaW5rcGF0aERlc3QoXHJcbiAgICAgICAgY3Vyci5saW5rLnNwbGl0KFwiI1wiKVswXSxcclxuICAgICAgICBcIlwiXHJcbiAgICAgICk7XHJcbiAgICAgIGNvbnN0IHRhcmdldF9maWxlX2NhY2hlID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUodGFyZ2V0RmlsZSk7XHJcbiAgICAgIC8vIGdldCBoZWFkaW5nXHJcbiAgICAgIGxldCBoZWFkaW5nX3RleHQgPSBjdXJyLmxpbmsuc3BsaXQoXCIjXCIpLnBvcCgpO1xyXG4gICAgICAvLyBpZiBoZWFkaW5nIHRleHQgY29udGFpbnMgYSBjdXJseSBicmFjZSwgZ2V0IHRoZSBudW1iZXIgaW5zaWRlIHRoZSBjdXJseSBicmFjZXMgYXMgb2NjdXJlbmNlXHJcbiAgICAgIGxldCBvY2N1cmVuY2UgPSAwO1xyXG4gICAgICBpZiAoaGVhZGluZ190ZXh0LmluZGV4T2YoXCJ7XCIpID4gLTEpIHtcclxuICAgICAgICAvLyBnZXQgb2NjdXJlbmNlXHJcbiAgICAgICAgb2NjdXJlbmNlID0gcGFyc2VJbnQoaGVhZGluZ190ZXh0LnNwbGl0KFwie1wiKVsxXS5zcGxpdChcIn1cIilbMF0pO1xyXG4gICAgICAgIC8vIHJlbW92ZSBvY2N1cmVuY2UgZnJvbSBoZWFkaW5nIHRleHRcclxuICAgICAgICBoZWFkaW5nX3RleHQgPSBoZWFkaW5nX3RleHQuc3BsaXQoXCJ7XCIpWzBdO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGdldCBoZWFkaW5ncyBmcm9tIGZpbGUgY2FjaGVcclxuICAgICAgY29uc3QgaGVhZGluZ3MgPSB0YXJnZXRfZmlsZV9jYWNoZS5oZWFkaW5ncztcclxuICAgICAgLy8gZ2V0IGhlYWRpbmdzIHdpdGggdGhlIHNhbWUgZGVwdGggYW5kIHRleHQgYXMgdGhlIGxpbmtcclxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBoZWFkaW5ncy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmIChoZWFkaW5nc1tpXS5oZWFkaW5nID09PSBoZWFkaW5nX3RleHQpIHtcclxuICAgICAgICAgIC8vIGlmIG9jY3VyZW5jZSBpcyAwLCBzZXQgaGVhZGluZyBhbmQgYnJlYWtcclxuICAgICAgICAgIGlmIChvY2N1cmVuY2UgPT09IDApIHtcclxuICAgICAgICAgICAgaGVhZGluZyA9IGhlYWRpbmdzW2ldO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIG9jY3VyZW5jZS0tOyAvLyBkZWNyZW1lbnQgb2NjdXJlbmNlXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0YXJnZXRGaWxlID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaXJzdExpbmtwYXRoRGVzdChjdXJyLmxpbmssIFwiXCIpO1xyXG4gICAgfVxyXG4gICAgbGV0IGxlYWY7XHJcbiAgICBpZiAoZXZlbnQpIHtcclxuICAgICAgLy8gcHJvcGVybHkgaGFuZGxlIGlmIHRoZSBtZXRhL2N0cmwga2V5IGlzIHByZXNzZWRcclxuICAgICAgY29uc3QgbW9kID0gT2JzaWRpYW4uS2V5bWFwLmlzTW9kRXZlbnQoZXZlbnQpO1xyXG4gICAgICAvLyBnZXQgbW9zdCByZWNlbnQgbGVhZlxyXG4gICAgICBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYobW9kKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIGdldCBtb3N0IHJlY2VudCBsZWFmXHJcbiAgICAgIGxlYWYgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TW9zdFJlY2VudExlYWYoKTtcclxuICAgIH1cclxuICAgIGF3YWl0IGxlYWYub3BlbkZpbGUodGFyZ2V0RmlsZSk7XHJcbiAgICBpZiAoaGVhZGluZykge1xyXG4gICAgICBsZXQgeyBlZGl0b3IgfSA9IGxlYWYudmlldztcclxuICAgICAgY29uc3QgcG9zID0geyBsaW5lOiBoZWFkaW5nLnBvc2l0aW9uLnN0YXJ0LmxpbmUsIGNoOiAwIH07XHJcbiAgICAgIGVkaXRvci5zZXRDdXJzb3IocG9zKTtcclxuICAgICAgZWRpdG9yLnNjcm9sbEludG9WaWV3KHsgdG86IHBvcywgZnJvbTogcG9zIH0sIHRydWUpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmVuZGVyX2Jsb2NrX2NvbnRleHQoYmxvY2spIHtcclxuICAgIGNvbnN0IGJsb2NrX2hlYWRpbmdzID0gYmxvY2subGluay5zcGxpdChcIi5tZFwiKVsxXS5zcGxpdChcIiNcIik7XHJcbiAgICAvLyBzdGFydGluZyB3aXRoIHRoZSBsYXN0IGhlYWRpbmcgZmlyc3QsIGl0ZXJhdGUgdGhyb3VnaCBoZWFkaW5nc1xyXG4gICAgbGV0IGJsb2NrX2NvbnRleHQgPSBcIlwiO1xyXG4gICAgZm9yIChsZXQgaSA9IGJsb2NrX2hlYWRpbmdzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgIGlmIChibG9ja19jb250ZXh0Lmxlbmd0aCA+IDApIHtcclxuICAgICAgICBibG9ja19jb250ZXh0ID0gYCA+ICR7YmxvY2tfY29udGV4dH1gO1xyXG4gICAgICB9XHJcbiAgICAgIGJsb2NrX2NvbnRleHQgPSBibG9ja19oZWFkaW5nc1tpXSArIGJsb2NrX2NvbnRleHQ7XHJcbiAgICAgIC8vIGlmIGJsb2NrIGNvbnRleHQgaXMgbG9uZ2VyIHRoYW4gTiBjaGFyYWN0ZXJzLCBicmVha1xyXG4gICAgICBpZiAoYmxvY2tfY29udGV4dC5sZW5ndGggPiAxMDApIHtcclxuICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8gcmVtb3ZlIGxlYWRpbmcgPiBpZiBleGlzdHNcclxuICAgIGlmIChibG9ja19jb250ZXh0LnN0YXJ0c1dpdGgoXCIgPiBcIikpIHtcclxuICAgICAgYmxvY2tfY29udGV4dCA9IGJsb2NrX2NvbnRleHQuc2xpY2UoMyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYmxvY2tfY29udGV4dDtcclxuICB9XHJcblxyXG4gIHJlbmRlcmFibGVfZmlsZV90eXBlKGxpbmspIHtcclxuICAgIHJldHVybiBsaW5rLmluZGV4T2YoXCIubWRcIikgIT09IC0xICYmIGxpbmsuaW5kZXhPZihcIi5leGNhbGlkcmF3XCIpID09PSAtMTtcclxuICB9XHJcblxyXG4gIHJlbmRlcl9leHRlcm5hbF9saW5rX2VsbShtZXRhKSB7XHJcbiAgICBpZiAobWV0YS5zb3VyY2UpIHtcclxuICAgICAgaWYgKG1ldGEuc291cmNlID09PSBcIkdtYWlsXCIpIG1ldGEuc291cmNlID0gXCJcdUQ4M0RcdURDRTcgR21haWxcIjtcclxuICAgICAgcmV0dXJuIGA8c21hbGw+JHttZXRhLnNvdXJjZX08L3NtYWxsPjxicj4ke21ldGEudGl0bGV9YDtcclxuICAgIH1cclxuICAgIC8vIHJlbW92ZSBodHRwKHMpOi8vXHJcbiAgICBsZXQgZG9tYWluID0gbWV0YS5wYXRoLnJlcGxhY2UoLyheXFx3Kzp8XilcXC9cXC8vLCBcIlwiKTtcclxuICAgIC8vIHNlcGFyYXRlIGRvbWFpbiBmcm9tIHBhdGhcclxuICAgIGRvbWFpbiA9IGRvbWFpbi5zcGxpdChcIi9cIilbMF07XHJcbiAgICAvLyB3cmFwIGRvbWFpbiBpbiA8c21hbGw+IGFuZCBhZGQgbGluZSBicmVha1xyXG4gICAgcmV0dXJuIGA8c21hbGw+XHVEODNDXHVERjEwICR7ZG9tYWlufTwvc21hbGw+PGJyPiR7bWV0YS50aXRsZX1gO1xyXG4gIH1cclxuICAvLyBnZXQgYWxsIGZvbGRlcnNcclxuICBhc3luYyBnZXRfYWxsX2ZvbGRlcnMoKSB7XHJcbiAgICBpZiAoIXRoaXMuZm9sZGVycyB8fCB0aGlzLmZvbGRlcnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHRoaXMuZm9sZGVycyA9IGF3YWl0IHRoaXMuZ2V0X2ZvbGRlcnMoKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLmZvbGRlcnM7XHJcbiAgfVxyXG4gIC8vIGdldCBmb2xkZXJzLCB0cmF2ZXJzZSBub24taGlkZGVuIHN1Yi1mb2xkZXJzXHJcbiAgYXN5bmMgZ2V0X2ZvbGRlcnMocGF0aCA9IFwiL1wiKSB7XHJcbiAgICBsZXQgZm9sZGVycyA9IChhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmxpc3QocGF0aCkpLmZvbGRlcnM7XHJcbiAgICBsZXQgZm9sZGVyX2xpc3QgPSBbXTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZm9sZGVycy5sZW5ndGg7IGkrKykge1xyXG4gICAgICBpZiAoZm9sZGVyc1tpXS5zdGFydHNXaXRoKFwiLlwiKSkgY29udGludWU7XHJcbiAgICAgIGZvbGRlcl9saXN0LnB1c2goZm9sZGVyc1tpXSk7XHJcbiAgICAgIGZvbGRlcl9saXN0ID0gZm9sZGVyX2xpc3QuY29uY2F0KFxyXG4gICAgICAgIGF3YWl0IHRoaXMuZ2V0X2ZvbGRlcnMoZm9sZGVyc1tpXSArIFwiL1wiKVxyXG4gICAgICApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvbGRlcl9saXN0O1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgYnVpbGRfbm90ZXNfb2JqZWN0KGZpbGVzKSB7XHJcbiAgICBsZXQgb3V0cHV0ID0ge307XHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWxlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICBsZXQgZmlsZSA9IGZpbGVzW2ldO1xyXG4gICAgICBsZXQgcGFydHMgPSBmaWxlLnBhdGguc3BsaXQoXCIvXCIpO1xyXG4gICAgICBsZXQgY3VycmVudCA9IG91dHB1dDtcclxuXHJcbiAgICAgIGZvciAobGV0IGlpID0gMDsgaWkgPCBwYXJ0cy5sZW5ndGg7IGlpKyspIHtcclxuICAgICAgICBsZXQgcGFydCA9IHBhcnRzW2lpXTtcclxuXHJcbiAgICAgICAgaWYgKGlpID09PSBwYXJ0cy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAvLyBUaGlzIGlzIGEgZmlsZVxyXG4gICAgICAgICAgY3VycmVudFtwYXJ0XSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIFRoaXMgaXMgYSBkaXJlY3RvcnlcclxuICAgICAgICAgIGlmICghY3VycmVudFtwYXJ0XSkge1xyXG4gICAgICAgICAgICBjdXJyZW50W3BhcnRdID0ge307XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgY3VycmVudCA9IGN1cnJlbnRbcGFydF07XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG91dHB1dDtcclxuICB9XHJcblxyXG4gIGFzeW5jIGluaXRpYWxpemVQcm9maWxlcygpIHtcclxuICAgIGlmICghdGhpcy5zZXR0aW5ncy5wcm9maWxlcyB8fCB0aGlzLnNldHRpbmdzLnByb2ZpbGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aGlzLnNldHRpbmdzLnByb2ZpbGVzID0gW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIG5hbWU6IFwiT3BlbkFJIERlZmF1bHRcIixcclxuICAgICAgICAgIGVuZHBvaW50OiBcImh0dHBzOi8vYXBpLm9wZW5haS5jb20vdjEvZW1iZWRkaW5nc1wiLFxyXG4gICAgICAgICAgaGVhZGVyczogSlNPTi5zdHJpbmdpZnkoXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcclxuICAgICAgICAgICAgICBBdXRob3JpemF0aW9uOiBcIkJlYXJlciBzay0/XCIsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIG51bGwsXHJcbiAgICAgICAgICAgIDJcclxuICAgICAgICAgICksXHJcbiAgICAgICAgICByZXF1ZXN0Qm9keTogSlNPTi5zdHJpbmdpZnkoXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICBtb2RlbDogXCJ0ZXh0LWVtYmVkZGluZy1hZGEtMDAyXCIsXHJcbiAgICAgICAgICAgICAgaW5wdXQ6IFwie2VtYmVkX2lucHV0fVwiLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBudWxsLFxyXG4gICAgICAgICAgICAyXHJcbiAgICAgICAgICApLFxyXG4gICAgICAgICAgcmVzcG9uc2VKU09OOiBKU09OLnN0cmluZ2lmeShcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIGRhdGE6IFtcclxuICAgICAgICAgICAgICAgIHsgZW1iZWRkaW5nOiBcIntlbWJlZF9vdXRwdXR9XCIsIGluZGV4OiAwLCBvYmplY3Q6IFwiZW1iZWRkaW5nXCIgfSxcclxuICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICAgIG1vZGVsOiBcInRleHQtZW1iZWRkaW5nLWFkYS0wMDItdjJcIixcclxuICAgICAgICAgICAgICBvYmplY3Q6IFwibGlzdFwiLFxyXG4gICAgICAgICAgICAgIHVzYWdlOiB7IHByb21wdF90b2tlbnM6IDEyLCB0b3RhbF90b2tlbnM6IDEyIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIG51bGwsXHJcbiAgICAgICAgICAgIDJcclxuICAgICAgICAgICksXHJcbiAgICAgICAgfSxcclxuICAgICAgXTtcclxuICAgICAgdGhpcy5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleCA9IDA7XHJcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5jb25zdCBTTUFSVF9DT05ORUNUSU9OU19WSUVXX1RZUEUgPSBcInNtYXJ0LWNvbm5lY3Rpb25zLXZpZXdcIjtcclxuY2xhc3MgU21hcnRDb25uZWN0aW9uc1ZpZXcgZXh0ZW5kcyBPYnNpZGlhbi5JdGVtVmlldyB7XHJcbiAgY29uc3RydWN0b3IobGVhZiwgcGx1Z2luKSB7XHJcbiAgICBzdXBlcihsZWFmKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgdGhpcy5uZWFyZXN0ID0gbnVsbDtcclxuICAgIHRoaXMubG9hZF93YWl0ID0gbnVsbDtcclxuICB9XHJcbiAgZ2V0Vmlld1R5cGUoKSB7XHJcbiAgICByZXR1cm4gU01BUlRfQ09OTkVDVElPTlNfVklFV19UWVBFO1xyXG4gIH1cclxuXHJcbiAgZ2V0RGlzcGxheVRleHQoKSB7XHJcbiAgICByZXR1cm4gXCJTbWFydCBDb25uZWN0aW9ucyBGaWxlc1wiO1xyXG4gIH1cclxuXHJcbiAgZ2V0SWNvbigpIHtcclxuICAgIHJldHVybiBcInNtYXJ0LWNvbm5lY3Rpb25zXCI7XHJcbiAgfVxyXG5cclxuICBzZXRfbWVzc2FnZShtZXNzYWdlKSB7XHJcbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lckVsLmNoaWxkcmVuWzFdO1xyXG4gICAgLy8gY2xlYXIgY29udGFpbmVyXHJcbiAgICBjb250YWluZXIuZW1wdHkoKTtcclxuICAgIC8vIGluaXRpYXRlIHRvcCBiYXJcclxuICAgIHRoaXMuaW5pdGlhdGVfdG9wX2Jhcihjb250YWluZXIpO1xyXG4gICAgLy8gaWYgbWVzYWdlIGlzIGFuIGFycmF5LCBsb29wIHRocm91Z2ggYW5kIGNyZWF0ZSBhIG5ldyBwIGVsZW1lbnQgZm9yIGVhY2ggbWVzc2FnZVxyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkobWVzc2FnZSkpIHtcclxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtZXNzYWdlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29udGFpbmVyLmNyZWF0ZUVsKFwicFwiLCB7IGNsczogXCJzY19tZXNzYWdlXCIsIHRleHQ6IG1lc3NhZ2VbaV0gfSk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIGNyZWF0ZSBwIGVsZW1lbnQgd2l0aCBtZXNzYWdlXHJcbiAgICAgIGNvbnRhaW5lci5jcmVhdGVFbChcInBcIiwgeyBjbHM6IFwic2NfbWVzc2FnZVwiLCB0ZXh0OiBtZXNzYWdlIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuICByZW5kZXJfbGlua190ZXh0KGxpbmssIHNob3dfZnVsbF9wYXRoID0gZmFsc2UpIHtcclxuICAgIC8qKlxyXG4gICAgICogQmVnaW4gaW50ZXJuYWwgbGlua3NcclxuICAgICAqL1xyXG4gICAgLy8gaWYgc2hvdyBmdWxsIHBhdGggaXMgZmFsc2UsIHJlbW92ZSBmaWxlIHBhdGhcclxuICAgIGlmICghc2hvd19mdWxsX3BhdGgpIHtcclxuICAgICAgbGluayA9IGxpbmsuc3BsaXQoXCIvXCIpLnBvcCgpO1xyXG4gICAgfVxyXG4gICAgLy8gaWYgY29udGFpbnMgJyMnXHJcbiAgICBpZiAobGluay5pbmRleE9mKFwiI1wiKSA+IC0xKSB7XHJcbiAgICAgIC8vIHNwbGl0IGF0IC5tZFxyXG4gICAgICBsaW5rID0gbGluay5zcGxpdChcIi5tZFwiKTtcclxuICAgICAgLy8gd3JhcCBmaXJzdCBwYXJ0IGluIDxzbWFsbD4gYW5kIGFkZCBsaW5lIGJyZWFrXHJcbiAgICAgIGxpbmtbMF0gPSBgPHNtYWxsPiR7bGlua1swXX08L3NtYWxsPjxicj5gO1xyXG4gICAgICAvLyBqb2luIGJhY2sgdG9nZXRoZXJcclxuICAgICAgbGluayA9IGxpbmsuam9pbihcIlwiKTtcclxuICAgICAgLy8gcmVwbGFjZSAnIycgd2l0aCAnIFx1MDBCQiAnXHJcbiAgICAgIGxpbmsgPSBsaW5rLnJlcGxhY2UoL1xcIy9nLCBcIiBcdTAwQkIgXCIpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gcmVtb3ZlICcubWQnXHJcbiAgICAgIGxpbmsgPSBsaW5rLnJlcGxhY2UoXCIubWRcIiwgXCJcIik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbGluaztcclxuICB9XHJcblxyXG4gIHNldF9uZWFyZXN0KG5lYXJlc3QsIG5lYXJlc3RfY29udGV4dCA9IG51bGwsIHJlc3VsdHNfb25seSA9IGZhbHNlKSB7XHJcbiAgICAvLyBnZXQgY29udGFpbmVyIGVsZW1lbnRcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY29udGFpbmVyRWwuY2hpbGRyZW5bMV07XHJcbiAgICAvLyBpZiByZXN1bHRzIG9ubHkgaXMgZmFsc2UsIGNsZWFyIGNvbnRhaW5lciBhbmQgaW5pdGlhdGUgdG9wIGJhclxyXG4gICAgaWYgKCFyZXN1bHRzX29ubHkpIHtcclxuICAgICAgLy8gY2xlYXIgY29udGFpbmVyXHJcbiAgICAgIGNvbnRhaW5lci5lbXB0eSgpO1xyXG4gICAgICB0aGlzLmluaXRpYXRlX3RvcF9iYXIoY29udGFpbmVyLCBuZWFyZXN0X2NvbnRleHQpO1xyXG4gICAgfVxyXG4gICAgLy8gdXBkYXRlIHJlc3VsdHNcclxuICAgIHRoaXMucGx1Z2luLnVwZGF0ZV9yZXN1bHRzKGNvbnRhaW5lciwgbmVhcmVzdCk7XHJcbiAgfVxyXG5cclxuICBpbml0aWF0ZV90b3BfYmFyKGNvbnRhaW5lciwgbmVhcmVzdF9jb250ZXh0ID0gbnVsbCkge1xyXG4gICAgbGV0IHRvcF9iYXI7XHJcbiAgICAvLyBpZiB0b3AgYmFyIGFscmVhZHkgZXhpc3RzLCBlbXB0eSBpdFxyXG4gICAgaWYgKFxyXG4gICAgICBjb250YWluZXIuY2hpbGRyZW4ubGVuZ3RoID4gMCAmJlxyXG4gICAgICBjb250YWluZXIuY2hpbGRyZW5bMF0uY2xhc3NMaXN0LmNvbnRhaW5zKFwic2MtdG9wLWJhclwiKVxyXG4gICAgKSB7XHJcbiAgICAgIHRvcF9iYXIgPSBjb250YWluZXIuY2hpbGRyZW5bMF07XHJcbiAgICAgIHRvcF9iYXIuZW1wdHkoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIGluaXQgY29udGFpbmVyIGZvciB0b3AgYmFyXHJcbiAgICAgIHRvcF9iYXIgPSBjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwic2MtdG9wLWJhclwiIH0pO1xyXG4gICAgfVxyXG4gICAgLy8gaWYgaGlnaGxpZ2h0ZWQgdGV4dCBpcyBub3QgbnVsbCwgY3JlYXRlIHAgZWxlbWVudCB3aXRoIGhpZ2hsaWdodGVkIHRleHRcclxuICAgIGlmIChuZWFyZXN0X2NvbnRleHQpIHtcclxuICAgICAgdG9wX2Jhci5jcmVhdGVFbChcInBcIiwgeyBjbHM6IFwic2MtY29udGV4dFwiLCB0ZXh0OiBuZWFyZXN0X2NvbnRleHQgfSk7XHJcbiAgICB9XHJcbiAgICAvLyBhZGQgY2hhdCBidXR0b25cclxuICAgIGNvbnN0IGNoYXRfYnV0dG9uID0gdG9wX2Jhci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJzYy1jaGF0LWJ1dHRvblwiIH0pO1xyXG4gICAgLy8gYWRkIGljb24gdG8gY2hhdCBidXR0b25cclxuICAgIE9ic2lkaWFuLnNldEljb24oY2hhdF9idXR0b24sIFwibWVzc2FnZS1zcXVhcmVcIik7XHJcbiAgICAvLyBhZGQgY2xpY2sgbGlzdGVuZXIgdG8gY2hhdCBidXR0b25cclxuICAgIGNoYXRfYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgIC8vIG9wZW4gY2hhdFxyXG4gICAgICB0aGlzLnBsdWdpbi5vcGVuX2NoYXQoKTtcclxuICAgIH0pO1xyXG4gICAgLy8gYWRkIHNlYXJjaCBidXR0b25cclxuICAgIGNvbnN0IHNlYXJjaF9idXR0b24gPSB0b3BfYmFyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcclxuICAgICAgY2xzOiBcInNjLXNlYXJjaC1idXR0b25cIixcclxuICAgIH0pO1xyXG4gICAgLy8gYWRkIGljb24gdG8gc2VhcmNoIGJ1dHRvblxyXG4gICAgT2JzaWRpYW4uc2V0SWNvbihzZWFyY2hfYnV0dG9uLCBcInNlYXJjaFwiKTtcclxuICAgIC8vIGFkZCBjbGljayBsaXN0ZW5lciB0byBzZWFyY2ggYnV0dG9uXHJcbiAgICBzZWFyY2hfYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgIC8vIGVtcHR5IHRvcCBiYXJcclxuICAgICAgdG9wX2Jhci5lbXB0eSgpO1xyXG4gICAgICAvLyBjcmVhdGUgaW5wdXQgZWxlbWVudFxyXG4gICAgICBjb25zdCBzZWFyY2hfY29udGFpbmVyID0gdG9wX2Jhci5jcmVhdGVFbChcImRpdlwiLCB7XHJcbiAgICAgICAgY2xzOiBcInNlYXJjaC1pbnB1dC1jb250YWluZXJcIixcclxuICAgICAgfSk7XHJcbiAgICAgIGNvbnN0IGlucHV0ID0gc2VhcmNoX2NvbnRhaW5lci5jcmVhdGVFbChcImlucHV0XCIsIHtcclxuICAgICAgICBjbHM6IFwic2Mtc2VhcmNoLWlucHV0XCIsXHJcbiAgICAgICAgdHlwZTogXCJzZWFyY2hcIixcclxuICAgICAgICBwbGFjZWhvbGRlcjogXCJUeXBlIHRvIHN0YXJ0IHNlYXJjaC4uLlwiLFxyXG4gICAgICB9KTtcclxuICAgICAgLy8gZm9jdXMgaW5wdXRcclxuICAgICAgaW5wdXQuZm9jdXMoKTtcclxuICAgICAgLy8gYWRkIGtleWRvd24gbGlzdGVuZXIgdG8gaW5wdXRcclxuICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgLy8gaWYgZXNjYXBlIGtleSBpcyBwcmVzc2VkXHJcbiAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFc2NhcGVcIikge1xyXG4gICAgICAgICAgdGhpcy5jbGVhcl9hdXRvX3NlYXJjaGVyKCk7XHJcbiAgICAgICAgICAvLyBjbGVhciB0b3AgYmFyXHJcbiAgICAgICAgICB0aGlzLmluaXRpYXRlX3RvcF9iYXIoY29udGFpbmVyLCBuZWFyZXN0X2NvbnRleHQpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBhZGQga2V5dXAgbGlzdGVuZXIgdG8gaW5wdXRcclxuICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImtleXVwXCIsIChldmVudCkgPT4ge1xyXG4gICAgICAgIC8vIGlmIHRoaXMuc2VhcmNoX3RpbWVvdXQgaXMgbm90IG51bGwgdGhlbiBjbGVhciBpdCBhbmQgc2V0IHRvIG51bGxcclxuICAgICAgICB0aGlzLmNsZWFyX2F1dG9fc2VhcmNoZXIoKTtcclxuICAgICAgICAvLyBnZXQgc2VhcmNoIHRlcm1cclxuICAgICAgICBjb25zdCBzZWFyY2hfdGVybSA9IGlucHV0LnZhbHVlO1xyXG4gICAgICAgIC8vIGlmIGVudGVyIGtleSBpcyBwcmVzc2VkXHJcbiAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiICYmIHNlYXJjaF90ZXJtICE9PSBcIlwiKSB7XHJcbiAgICAgICAgICB0aGlzLnNlYXJjaChzZWFyY2hfdGVybSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGlmIGFueSBvdGhlciBrZXkgaXMgcHJlc3NlZCBhbmQgaW5wdXQgaXMgbm90IGVtcHR5IHRoZW4gd2FpdCA1MDBtcyBhbmQgbWFrZV9jb25uZWN0aW9uc1xyXG4gICAgICAgIGVsc2UgaWYgKHNlYXJjaF90ZXJtICE9PSBcIlwiKSB7XHJcbiAgICAgICAgICAvLyBjbGVhciB0aW1lb3V0XHJcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5zZWFyY2hfdGltZW91dCk7XHJcbiAgICAgICAgICAvLyBzZXQgdGltZW91dFxyXG4gICAgICAgICAgdGhpcy5zZWFyY2hfdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnNlYXJjaChzZWFyY2hfdGVybSwgdHJ1ZSk7XHJcbiAgICAgICAgICB9LCA3MDApO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vIHJlbmRlciBidXR0b25zOiBcImNyZWF0ZVwiIGFuZCBcInJldHJ5XCIgZm9yIGxvYWRpbmcgZW1iZWRkaW5ncy5qc29uIGZpbGVcclxuICByZW5kZXJfZW1iZWRkaW5nc19idXR0b25zKCkge1xyXG4gICAgLy8gZ2V0IGNvbnRhaW5lciBlbGVtZW50XHJcbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lckVsLmNoaWxkcmVuWzFdO1xyXG4gICAgLy8gY2xlYXIgY29udGFpbmVyXHJcbiAgICBjb250YWluZXIuZW1wdHkoKTtcclxuICAgIC8vIGNyZWF0ZSBoZWFkaW5nIHRoYXQgc2F5cyBcIkVtYmVkZGluZ3MgZmlsZSBub3QgZm91bmRcIlxyXG4gICAgY29udGFpbmVyLmNyZWF0ZUVsKFwiaDJcIiwge1xyXG4gICAgICBjbHM6IFwic2NIZWFkaW5nXCIsXHJcbiAgICAgIHRleHQ6IFwiRW1iZWRkaW5ncyBmaWxlIG5vdCBmb3VuZFwiLFxyXG4gICAgfSk7XHJcbiAgICAvLyBjcmVhdGUgZGl2IGZvciBidXR0b25zXHJcbiAgICBjb25zdCBidXR0b25fZGl2ID0gY29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcInNjQnV0dG9uRGl2XCIgfSk7XHJcbiAgICAvLyBjcmVhdGUgXCJjcmVhdGVcIiBidXR0b25cclxuICAgIGNvbnN0IGNyZWF0ZV9idXR0b24gPSBidXR0b25fZGl2LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcclxuICAgICAgY2xzOiBcInNjQnV0dG9uXCIsXHJcbiAgICAgIHRleHQ6IFwiQ3JlYXRlIGVtYmVkZGluZ3MuanNvblwiLFxyXG4gICAgfSk7XHJcbiAgICAvLyBub3RlIHRoYXQgY3JlYXRpbmcgZW1iZWRkaW5ncy5qc29uIGZpbGUgd2lsbCB0cmlnZ2VyIGJ1bGsgZW1iZWRkaW5nIGFuZCBtYXkgdGFrZSBhIHdoaWxlXHJcbiAgICBidXR0b25fZGl2LmNyZWF0ZUVsKFwicFwiLCB7XHJcbiAgICAgIGNsczogXCJzY0J1dHRvbk5vdGVcIixcclxuICAgICAgdGV4dDogXCJXYXJuaW5nOiBDcmVhdGluZyBlbWJlZGRpbmdzLmpzb24gZmlsZSB3aWxsIHRyaWdnZXIgYnVsayBlbWJlZGRpbmcgYW5kIG1heSB0YWtlIGEgd2hpbGVcIixcclxuICAgIH0pO1xyXG4gICAgLy8gY3JlYXRlIFwicmV0cnlcIiBidXR0b25cclxuICAgIGNvbnN0IHJldHJ5X2J1dHRvbiA9IGJ1dHRvbl9kaXYuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICBjbHM6IFwic2NCdXR0b25cIixcclxuICAgICAgdGV4dDogXCJSZXRyeVwiLFxyXG4gICAgfSk7XHJcbiAgICAvLyB0cnkgdG8gbG9hZCBlbWJlZGRpbmdzLmpzb24gZmlsZSBhZ2FpblxyXG4gICAgYnV0dG9uX2Rpdi5jcmVhdGVFbChcInBcIiwge1xyXG4gICAgICBjbHM6IFwic2NCdXR0b25Ob3RlXCIsXHJcbiAgICAgIHRleHQ6IFwiSWYgZW1iZWRkaW5ncy5qc29uIGZpbGUgYWxyZWFkeSBleGlzdHMsIGNsaWNrICdSZXRyeScgdG8gbG9hZCBpdFwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gYWRkIGNsaWNrIGV2ZW50IHRvIFwiY3JlYXRlXCIgYnV0dG9uXHJcbiAgICBjcmVhdGVfYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIC8vIGNyZWF0ZSBlbWJlZGRpbmdzLmpzb24gZmlsZVxyXG4gICAgICBjb25zdCBwcm9maWxlU3BlY2lmaWNGaWxlTmFtZSA9IGBlbWJlZGRpbmdzLSR7dGhpcy5zZWxlY3RlZFByb2ZpbGUubmFtZX0uanNvbmA7XHJcbiAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNtYXJ0X3ZlY19saXRlLmluaXRfZW1iZWRkaW5nc19maWxlKHByb2ZpbGVTcGVjaWZpY0ZpbGVOYW1lKTtcclxuICAgICAgLy8gcmVsb2FkIHZpZXdcclxuICAgICAgYXdhaXQgdGhpcy5yZW5kZXJfY29ubmVjdGlvbnMoKTtcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIGFkZCBjbGljayBldmVudCB0byBcInJldHJ5XCIgYnV0dG9uXHJcbiAgICByZXRyeV9idXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc29sZS5sb2coXCJyZXRyeWluZyB0byBsb2FkIGVtYmVkZGluZ3MuanNvbiBmaWxlXCIpO1xyXG4gICAgICAvLyByZWxvYWQgZW1iZWRkaW5ncy5qc29uIGZpbGVcclxuICAgICAgY29uc3QgcHJvZmlsZVNwZWNpZmljRmlsZU5hbWUgPSBgZW1iZWRkaW5ncy0ke3RoaXMuc2VsZWN0ZWRQcm9maWxlLm5hbWV9Lmpzb25gO1xyXG4gICAgICBhd2FpdCB0aGlzLnBsdWdpbi5pbml0X3ZlY3MocHJvZmlsZVNwZWNpZmljRmlsZU5hbWUpO1xyXG4gICAgICAvLyByZWxvYWQgdmlld1xyXG4gICAgICBhd2FpdCB0aGlzLnJlbmRlcl9jb25uZWN0aW9ucygpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBvbk9wZW4oKSB7XHJcbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lckVsLmNoaWxkcmVuWzFdO1xyXG4gICAgY29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAvLyBwbGFjZWhvbGRlciB0ZXh0XHJcbiAgICBjb250YWluZXIuY3JlYXRlRWwoXCJwXCIsIHtcclxuICAgICAgY2xzOiBcInNjUGxhY2Vob2xkZXJcIixcclxuICAgICAgdGV4dDogXCJPcGVuIGEgbm90ZSB0byBmaW5kIGNvbm5lY3Rpb25zLlwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gcnVucyB3aGVuIGZpbGUgaXMgb3BlbmVkXHJcbiAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckV2ZW50KFxyXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgKGZpbGUpID0+IHtcclxuICAgICAgICAvLyBpZiBubyBmaWxlIGlzIG9wZW4sIHJldHVyblxyXG4gICAgICAgIGlmICghZmlsZSkge1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyByZXR1cm4gaWYgZmlsZSB0eXBlIGlzIG5vdCBzdXBwb3J0ZWRcclxuICAgICAgICBpZiAoU1VQUE9SVEVEX0ZJTEVfVFlQRVMuaW5kZXhPZihmaWxlLmV4dGVuc2lvbikgPT09IC0xKSB7XHJcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRfbWVzc2FnZShbXHJcbiAgICAgICAgICAgIFwiRmlsZTogXCIgKyBmaWxlLm5hbWUsXHJcbiAgICAgICAgICAgIFwiVW5zdXBwb3J0ZWQgZmlsZSB0eXBlIChTdXBwb3J0ZWQ6IFwiICtcclxuICAgICAgICAgICAgICBTVVBQT1JURURfRklMRV9UWVBFUy5qb2luKFwiLCBcIikgK1xyXG4gICAgICAgICAgICAgIFwiKVwiLFxyXG4gICAgICAgICAgXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIHJ1biByZW5kZXJfY29ubmVjdGlvbnMgYWZ0ZXIgMSBzZWNvbmQgdG8gYWxsb3cgZm9yIGZpbGUgdG8gbG9hZFxyXG4gICAgICAgIGlmICh0aGlzLmxvYWRfd2FpdCkge1xyXG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMubG9hZF93YWl0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5sb2FkX3dhaXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgIHRoaXMucmVuZGVyX2Nvbm5lY3Rpb25zKGZpbGUpO1xyXG4gICAgICAgICAgdGhpcy5sb2FkX3dhaXQgPSBudWxsO1xyXG4gICAgICAgIH0sIDEwMDApO1xyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2UucmVnaXN0ZXJIb3ZlckxpbmtTb3VyY2UoU01BUlRfQ09OTkVDVElPTlNfVklFV19UWVBFLCB7XHJcbiAgICAgIGRpc3BsYXk6IFwiU21hcnQgQ29ubmVjdGlvbnMgRmlsZXNcIixcclxuICAgICAgZGVmYXVsdE1vZDogdHJ1ZSxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5hcHAud29ya3NwYWNlLnJlZ2lzdGVySG92ZXJMaW5rU291cmNlKFxyXG4gICAgICBTTUFSVF9DT05ORUNUSU9OU19DSEFUX1ZJRVdfVFlQRSxcclxuICAgICAge1xyXG4gICAgICAgIGRpc3BsYXk6IFwiU21hcnQgQ2hhdCBMaW5rc1wiLFxyXG4gICAgICAgIGRlZmF1bHRNb2Q6IHRydWUsXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkodGhpcy5pbml0aWFsaXplLmJpbmQodGhpcykpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgaW5pdGlhbGl6ZSgpIHtcclxuICAgIHRoaXMuc2V0X21lc3NhZ2UoXCJMb2FkaW5nIGVtYmVkZGluZ3MgZmlsZS4uLlwiKTtcclxuICAgIC8vIGNvbnNvbGUubG9nKHRoaXMpO1xyXG4gICAgY29uc3QgcHJvZmlsZVNwZWNpZmljRmlsZU5hbWUgPSBgZW1iZWRkaW5ncy0ke3RoaXMucGx1Z2luLnNldHRpbmdzLnByb2ZpbGVzW3RoaXMucGx1Z2luLnNldHRpbmdzLnNlbGVjdGVkUHJvZmlsZUluZGV4XS5uYW1lfS5qc29uYDtcclxuICAgIGNvbnN0IHZlY3NfaW50aWF0ZWQgPSBhd2FpdCB0aGlzLnBsdWdpbi5pbml0X3ZlY3MocHJvZmlsZVNwZWNpZmljRmlsZU5hbWUpO1xyXG4gICAgLy8gY29uc3QgdmVjc19pbnRpYXRlZCA9IGF3YWl0IHRoaXMucGx1Z2luLmluaXRfdmVjcygpO1xyXG4gICAgaWYgKHZlY3NfaW50aWF0ZWQpIHtcclxuICAgICAgdGhpcy5zZXRfbWVzc2FnZShcIkVtYmVkZGluZ3MgZmlsZSBsb2FkZWQuXCIpO1xyXG4gICAgICBhd2FpdCB0aGlzLnJlbmRlcl9jb25uZWN0aW9ucygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5yZW5kZXJfZW1iZWRkaW5nc19idXR0b25zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFWFBFUklNRU5UQUxcclxuICAgICAqIC0gd2luZG93LWJhc2VkIEFQSSBhY2Nlc3NcclxuICAgICAqIC0gY29kZS1ibG9jayByZW5kZXJpbmdcclxuICAgICAqL1xyXG4gICAgdGhpcy5hcGkgPSBuZXcgU21hcnRDb25uZWN0aW9uc1ZpZXdBcGkodGhpcy5hcHAsIHRoaXMucGx1Z2luLCB0aGlzKTtcclxuICAgIC8vIHJlZ2lzdGVyIEFQSSB0byBnbG9iYWwgd2luZG93IG9iamVjdFxyXG4gICAgKHdpbmRvd1tcIlNtYXJ0Q29ubmVjdGlvbnNWaWV3QXBpXCJdID0gdGhpcy5hcGkpICYmXHJcbiAgICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gZGVsZXRlIHdpbmRvd1tcIlNtYXJ0Q29ubmVjdGlvbnNWaWV3QXBpXCJdKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIG9uQ2xvc2UoKSB7XHJcbiAgICBjb25zb2xlLmxvZyhcImNsb3Npbmcgc21hcnQgY29ubmVjdGlvbnMgdmlld1wiKTtcclxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS51bnJlZ2lzdGVySG92ZXJMaW5rU291cmNlKFNNQVJUX0NPTk5FQ1RJT05TX1ZJRVdfVFlQRSk7XHJcbiAgICB0aGlzLnBsdWdpbi52aWV3ID0gbnVsbDtcclxuICB9XHJcblxyXG4gIGFzeW5jIHJlbmRlcl9jb25uZWN0aW9ucyhjb250ZXh0ID0gbnVsbCkge1xyXG4gICAgY29uc29sZS5sb2coXCJyZW5kZXJpbmcgY29ubmVjdGlvbnNcIik7XHJcbiAgICBpZiAoIXRoaXMucGx1Z2luLmVtYmVkZGluZ3NfbG9hZGVkKSB7XHJcbiAgICAgIGNvbnN0IHByb2ZpbGVTcGVjaWZpY0ZpbGVOYW1lID0gYGVtYmVkZGluZ3MtJHt0aGlzLnNlbGVjdGVkUHJvZmlsZS5uYW1lfS5qc29uYDtcclxuICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uaW5pdF92ZWNzKHByb2ZpbGVTcGVjaWZpY0ZpbGVOYW1lKTtcclxuICAgIH1cclxuICAgIC8vIGlmIGVtYmVkZGluZyBzdGlsbCBub3QgbG9hZGVkLCByZXR1cm5cclxuICAgIGlmICghdGhpcy5wbHVnaW4uZW1iZWRkaW5nc19sb2FkZWQpIHtcclxuICAgICAgY29uc29sZS5sb2coXCJlbWJlZGRpbmdzIGZpbGVzIHN0aWxsIG5vdCBsb2FkZWQgb3IgeWV0IHRvIGJlIGNyZWF0ZWRcIik7XHJcbiAgICAgIHRoaXMucmVuZGVyX2VtYmVkZGluZ3NfYnV0dG9ucygpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICB0aGlzLnNldF9tZXNzYWdlKFwiTWFraW5nIFNtYXJ0IENvbm5lY3Rpb25zLi4uXCIpO1xyXG4gICAgLyoqXHJcbiAgICAgKiBCZWdpbiBoaWdobGlnaHRlZC10ZXh0LWxldmVsIHNlYXJjaFxyXG4gICAgICovXHJcbiAgICBpZiAodHlwZW9mIGNvbnRleHQgPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgY29uc3QgaGlnaGxpZ2h0ZWRfdGV4dCA9IGNvbnRleHQ7XHJcbiAgICAgIC8vIGdldCBlbWJlZGRpbmcgZm9yIGhpZ2hsaWdodGVkIHRleHRcclxuICAgICAgYXdhaXQgdGhpcy5zZWFyY2goaGlnaGxpZ2h0ZWRfdGV4dCk7XHJcbiAgICAgIHJldHVybjsgLy8gZW5kcyBoZXJlIGlmIGNvbnRleHQgaXMgYSBzdHJpbmdcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJlZ2luIGZpbGUtbGV2ZWwgc2VhcmNoXHJcbiAgICAgKi9cclxuICAgIHRoaXMubmVhcmVzdCA9IG51bGw7XHJcbiAgICB0aGlzLmludGVydmFsX2NvdW50ID0gMDtcclxuICAgIHRoaXMucmVuZGVyaW5nID0gZmFsc2U7XHJcbiAgICB0aGlzLmZpbGUgPSBjb250ZXh0O1xyXG4gICAgLy8gaWYgdGhpcy5pbnRlcnZhbCBpcyBzZXQgdGhlbiBjbGVhciBpdFxyXG4gICAgaWYgKHRoaXMuaW50ZXJ2YWwpIHtcclxuICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsKTtcclxuICAgICAgdGhpcy5pbnRlcnZhbCA9IG51bGw7XHJcbiAgICB9XHJcbiAgICAvLyBzZXQgaW50ZXJ2YWwgdG8gY2hlY2sgaWYgbmVhcmVzdCBpcyBzZXRcclxuICAgIHRoaXMuaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgIGlmICghdGhpcy5yZW5kZXJpbmcpIHtcclxuICAgICAgICBpZiAodGhpcy5maWxlIGluc3RhbmNlb2YgT2JzaWRpYW4uVEZpbGUpIHtcclxuICAgICAgICAgIHRoaXMucmVuZGVyaW5nID0gdHJ1ZTtcclxuICAgICAgICAgIHRoaXMucmVuZGVyX25vdGVfY29ubmVjdGlvbnModGhpcy5maWxlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8gZ2V0IGN1cnJlbnQgbm90ZVxyXG4gICAgICAgICAgdGhpcy5maWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcclxuICAgICAgICAgIC8vIGlmIHN0aWxsIG5vIGN1cnJlbnQgbm90ZSB0aGVuIHJldHVyblxyXG4gICAgICAgICAgaWYgKCF0aGlzLmZpbGUgJiYgdGhpcy5jb3VudCA+IDEpIHtcclxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRfbWVzc2FnZShcIk5vIGFjdGl2ZSBmaWxlXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlmICh0aGlzLm5lYXJlc3QpIHtcclxuICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5pbnRlcnZhbCk7XHJcbiAgICAgICAgICAvLyBpZiBuZWFyZXN0IGlzIGEgc3RyaW5nIHRoZW4gdXBkYXRlIHZpZXcgbWVzc2FnZVxyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLm5lYXJlc3QgPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgICAgdGhpcy5zZXRfbWVzc2FnZSh0aGlzLm5lYXJlc3QpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gc2V0IG5lYXJlc3QgY29ubmVjdGlvbnNcclxuICAgICAgICAgICAgdGhpcy5zZXRfbmVhcmVzdCh0aGlzLm5lYXJlc3QsIFwiRmlsZTogXCIgKyB0aGlzLmZpbGUubmFtZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAvLyBpZiByZW5kZXJfbG9nLmZhaWxlZF9lbWJlZGRpbmdzIHRoZW4gdXBkYXRlIGZhaWxlZF9lbWJlZGRpbmdzLnR4dFxyXG4gICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnJlbmRlcl9sb2cuZmFpbGVkX2VtYmVkZGluZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zYXZlX2ZhaWxlZF9lbWJlZGRpbmdzKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAvLyBnZXQgb2JqZWN0IGtleXMgb2YgcmVuZGVyX2xvZ1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ub3V0cHV0X3JlbmRlcl9sb2coKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5pbnRlcnZhbF9jb3VudCsrO1xyXG4gICAgICAgICAgdGhpcy5zZXRfbWVzc2FnZShcIk1ha2luZyBTbWFydCBDb25uZWN0aW9ucy4uLlwiICsgdGhpcy5pbnRlcnZhbF9jb3VudCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LCAxMCk7XHJcbiAgfVxyXG5cclxuICBhc3luYyByZW5kZXJfbm90ZV9jb25uZWN0aW9ucyhmaWxlKSB7XHJcbiAgICB0aGlzLm5lYXJlc3QgPSBhd2FpdCB0aGlzLnBsdWdpbi5maW5kX25vdGVfY29ubmVjdGlvbnMoZmlsZSk7XHJcbiAgfVxyXG5cclxuICBjbGVhcl9hdXRvX3NlYXJjaGVyKCkge1xyXG4gICAgaWYgKHRoaXMuc2VhcmNoX3RpbWVvdXQpIHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuc2VhcmNoX3RpbWVvdXQpO1xyXG4gICAgICB0aGlzLnNlYXJjaF90aW1lb3V0ID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIHNlYXJjaChzZWFyY2hfdGV4dCwgcmVzdWx0c19vbmx5ID0gZmFsc2UpIHtcclxuICAgIGNvbnN0IG5lYXJlc3QgPSBhd2FpdCB0aGlzLnBsdWdpbi5hcGkuc2VhcmNoKHNlYXJjaF90ZXh0KTtcclxuICAgIC8vIHJlbmRlciByZXN1bHRzIGluIHZpZXcgd2l0aCBmaXJzdCAxMDAgY2hhcmFjdGVycyBvZiBzZWFyY2ggdGV4dFxyXG4gICAgY29uc3QgbmVhcmVzdF9jb250ZXh0ID0gYFNlbGVjdGlvbjogXCIke1xyXG4gICAgICBzZWFyY2hfdGV4dC5sZW5ndGggPiAxMDBcclxuICAgICAgICA/IHNlYXJjaF90ZXh0LnN1YnN0cmluZygwLCAxMDApICsgXCIuLi5cIlxyXG4gICAgICAgIDogc2VhcmNoX3RleHRcclxuICAgIH1cImA7XHJcbiAgICB0aGlzLnNldF9uZWFyZXN0KG5lYXJlc3QsIG5lYXJlc3RfY29udGV4dCwgcmVzdWx0c19vbmx5KTtcclxuICB9XHJcbn1cclxuY2xhc3MgU21hcnRDb25uZWN0aW9uc1ZpZXdBcGkge1xyXG4gIGNvbnN0cnVjdG9yKGFwcCwgcGx1Z2luLCB2aWV3KSB7XHJcbiAgICB0aGlzLmFwcCA9IGFwcDtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgdGhpcy52aWV3ID0gdmlldztcclxuICB9XHJcbiAgYXN5bmMgc2VhcmNoKHNlYXJjaF90ZXh0KSB7XHJcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5wbHVnaW4uYXBpLnNlYXJjaChzZWFyY2hfdGV4dCk7XHJcbiAgfVxyXG4gIC8vIHRyaWdnZXIgcmVsb2FkIG9mIGVtYmVkZGluZ3MgZmlsZVxyXG4gIGFzeW5jIHJlbG9hZF9lbWJlZGRpbmdzX2ZpbGUoKSB7XHJcbiAgICBjb25zdCBwcm9maWxlU3BlY2lmaWNGaWxlTmFtZSA9IGBlbWJlZGRpbmdzLSR7dGhpcy5zZWxlY3RlZFByb2ZpbGUubmFtZX0uanNvbmA7XHJcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5pbml0X3ZlY3MocHJvZmlsZVNwZWNpZmljRmlsZU5hbWUpO1xyXG4gICAgYXdhaXQgdGhpcy52aWV3LnJlbmRlcl9jb25uZWN0aW9ucygpO1xyXG4gIH1cclxufVxyXG5jbGFzcyBTY1NlYXJjaEFwaSB7XHJcbiAgY29uc3RydWN0b3IoYXBwLCBwbHVnaW4pIHtcclxuICAgIHRoaXMuYXBwID0gYXBwO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG4gIGFzeW5jIHNlYXJjaChzZWFyY2hfdGV4dCwgZmlsdGVyID0ge30pIHtcclxuICAgIGZpbHRlciA9IHtcclxuICAgICAgc2tpcF9zZWN0aW9uczogdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2tpcF9zZWN0aW9ucyxcclxuICAgICAgLi4uZmlsdGVyLFxyXG4gICAgfTtcclxuICAgIGxldCBuZWFyZXN0ID0gW107XHJcbiAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5wbHVnaW4ucmVxdWVzdF9lbWJlZGRpbmdfZnJvbV9pbnB1dChzZWFyY2hfdGV4dCk7XHJcbiAgICBpZiAocmVzcCAmJiByZXNwLmRhdGEgJiYgcmVzcC5kYXRhWzBdICYmIHJlc3AuZGF0YVswXS5lbWJlZGRpbmcpIHtcclxuICAgICAgbmVhcmVzdCA9IHRoaXMucGx1Z2luLnNtYXJ0X3ZlY19saXRlLm5lYXJlc3QoXHJcbiAgICAgICAgcmVzcC5kYXRhWzBdLmVtYmVkZGluZyxcclxuICAgICAgICBmaWx0ZXJcclxuICAgICAgKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIHJlc3AgaXMgbnVsbCwgdW5kZWZpbmVkLCBvciBtaXNzaW5nIGRhdGFcclxuICAgICAgbmV3IE9ic2lkaWFuLk5vdGljZShcIlNtYXJ0IENvbm5lY3Rpb25zOiBFcnJvciBnZXR0aW5nIGVtYmVkZGluZ1wiKTtcclxuICAgIH1cclxuICAgIHJldHVybiBuZWFyZXN0O1xyXG4gIH1cclxufVxyXG5cclxuY2xhc3MgU21hcnRDb25uZWN0aW9uc1NldHRpbmdzVGFiIGV4dGVuZHMgT2JzaWRpYW4uUGx1Z2luU2V0dGluZ1RhYiB7XHJcbiAgY29uc3RydWN0b3IoYXBwLCBwbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgdGhpcy5wcm9maWxlRHJvcGRvd24gPSBudWxsO1xyXG4gICAgdGhpcy5wcm9maWxlTmFtZSA9IG51bGw7XHJcbiAgICB0aGlzLmVuZHBvaW50RmllbGQgPSBudWxsO1xyXG4gICAgdGhpcy5oZWFkZXJzRmllbGQgPSBudWxsO1xyXG4gICAgdGhpcy5yZXFCb2R5RmllbGQgPSBudWxsO1xyXG4gICAgdGhpcy5qc29uUGF0aEZpZWxkID0gbnVsbDtcclxuICAgIHRoaXMuc2VsZWN0ZWRJbmRleCA9IG51bGw7XHJcbiAgICB0aGlzLnNlbGVjdGVkUHJvZmlsZSA9IG51bGw7XHJcbiAgfVxyXG4gIGRpc3BsYXkoKSB7XHJcbiAgICBjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkVtYmVkZGluZ3MgQVBJXCIgfSk7XHJcblxyXG4gICAgLy8gUHJvZmlsZSBzZWxlY3Rpb24gZHJvcGRvd25cclxuICAgIHRoaXMucHJvZmlsZURyb3Bkb3duID0gbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiU2VsZWN0IFByb2ZpbGVcIilcclxuICAgICAgLnNldERlc2MoXCJTZWxlY3QgYW4gQVBJIHByb2ZpbGVcIilcclxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT4ge1xyXG4gICAgICAgIC8vIEFzc3VtZSBwbHVnaW4uc2V0dGluZ3MucHJvZmlsZXMgaXMgYW4gYXJyYXkgb2YgcHJvZmlsZXNcclxuICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9maWxlcy5mb3JFYWNoKChwcm9maWxlLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKGluZGV4LnRvU3RyaW5nKCksIHByb2ZpbGUubmFtZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwcm9maWxlIHNlbGVjdGlvbiBjaGFuZ2VcclxuICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkSW5kZXggPSBwYXJzZUludCh2YWx1ZSk7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleCA9IHNlbGVjdGVkSW5kZXg7XHJcbiAgICAgICAgICB0aGlzLnNlbGVjdGVkSW5kZXggPSBzZWxlY3RlZEluZGV4O1xyXG4gICAgICAgICAgYXdhaXQgYXBwbHlQcm9maWxlKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgIC8vIEluaXRpYWxpemUgYW5kIHN0b3JlIHJlZmVyZW5jZSB0byBBUEkgZW5kcG9pbnQgZmllbGRcclxuICAgIHRoaXMucHJvZmlsZU5hbWUgPSBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJQcm9maWxlIE5hbWVcIilcclxuICAgICAgLmFkZFRleHQoXHJcbiAgICAgICAgKHRleHQpID0+IHRleHRcclxuICAgICAgICAvLyB0ZXh0Lm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xyXG4gICAgICAgIC8vICAgLyogaGFuZGxlIGNoYW5nZSAqL1xyXG4gICAgICAgIC8vIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZSBhbmQgc3RvcmUgcmVmZXJlbmNlIHRvIEFQSSBlbmRwb2ludCBmaWVsZFxyXG4gICAgdGhpcy5lbmRwb2ludEZpZWxkID0gbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiQVBJIEVuZHBvaW50XCIpXHJcbiAgICAgIC5hZGRUZXh0KFxyXG4gICAgICAgICh0ZXh0KSA9PiB0ZXh0XHJcbiAgICAgICAgLy8gdGV4dC5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuICAgICAgICAvLyAgIC8qIGhhbmRsZSBjaGFuZ2UgKi9cclxuICAgICAgICAvLyB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIC8vIFRleHQgYXJlYSBmb3IgY3VzdG9tIGhlYWRlcnNcclxuICAgIHRoaXMuaGVhZGVyc0ZpZWxkID0gbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiQ3VzdG9tIEhlYWRlcnNcIilcclxuICAgICAgLmFkZFRleHRBcmVhKCh0ZXh0QXJlYSkgPT5cclxuICAgICAgICB0ZXh0QXJlYS5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuICAgICAgICAgIC8vIEhhbmRsZSBoZWFkZXJzIGNoYW5nZVxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgLy8gVGV4dCBhcmVhIGZvciBjdXN0b20gaGVhZGVyc1xyXG4gICAgdGhpcy5yZXFCb2R5RmllbGQgPSBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJSZXF1ZXN0IEJvZHlcIilcclxuICAgICAgLmFkZFRleHRBcmVhKCh0ZXh0QXJlYSkgPT5cclxuICAgICAgICB0ZXh0QXJlYS5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuICAgICAgICAgIC8vIEhhbmRsZSBoZWFkZXJzIGNoYW5nZVxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgLy8gVGV4dCBmaWVsZCBmb3IgSlNPTiBwYXRoXHJcbiAgICB0aGlzLmpzb25QYXRoRmllbGQgPSBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJSZXNwb25zZSBKU09OXCIpXHJcbiAgICAgIC5hZGRUZXh0QXJlYSgodGV4dEFyZWEpID0+XHJcbiAgICAgICAgdGV4dEFyZWEub25DaGFuZ2UoKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAvLyBIYW5kbGUgSlNPTiBwYXRoIGNoYW5nZVxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgY29uc3QgYXBwbHlQcm9maWxlID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgICBpZiAodGhpcy5zZWxlY3RlZEluZGV4ID49IDApIHtcclxuICAgICAgICB0aGlzLnNlbGVjdGVkUHJvZmlsZSA9XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9maWxlc1t0aGlzLnNlbGVjdGVkSW5kZXhdO1xyXG5cclxuICAgICAgICB0aGlzLnByb2ZpbGVOYW1lLmNvbXBvbmVudHNbMF0uaW5wdXRFbC52YWx1ZSA9XHJcbiAgICAgICAgICB0aGlzLnNlbGVjdGVkUHJvZmlsZS5uYW1lO1xyXG4gICAgICAgIHRoaXMuZW5kcG9pbnRGaWVsZC5jb21wb25lbnRzWzBdLmlucHV0RWwudmFsdWUgPVxyXG4gICAgICAgICAgdGhpcy5zZWxlY3RlZFByb2ZpbGUuZW5kcG9pbnQ7XHJcbiAgICAgICAgdGhpcy5oZWFkZXJzRmllbGQuY29tcG9uZW50c1swXS5pbnB1dEVsLnZhbHVlID1cclxuICAgICAgICAgIHRoaXMuc2VsZWN0ZWRQcm9maWxlLmhlYWRlcnM7XHJcbiAgICAgICAgdGhpcy5yZXFCb2R5RmllbGQuY29tcG9uZW50c1swXS5pbnB1dEVsLnZhbHVlID1cclxuICAgICAgICAgIHRoaXMuc2VsZWN0ZWRQcm9maWxlLnJlcXVlc3RCb2R5O1xyXG4gICAgICAgIHRoaXMuanNvblBhdGhGaWVsZC5jb21wb25lbnRzWzBdLmlucHV0RWwudmFsdWUgPVxyXG4gICAgICAgICAgdGhpcy5zZWxlY3RlZFByb2ZpbGUucmVzcG9uc2VKU09OO1xyXG5cclxuICAgICAgICAgIGNvbnN0IHByb2ZpbGVTcGVjaWZpY0ZpbGVOYW1lID0gYGVtYmVkZGluZ3MtJHt0aGlzLnNlbGVjdGVkUHJvZmlsZS5uYW1lfS5qc29uYDtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uaW5pdF92ZWNzKHByb2ZpbGVTcGVjaWZpY0ZpbGVOYW1lKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvLy8gQ3JlYXRlIGEgY29udGFpbmVyIGZvciBidXR0b25zXHJcbiAgICBjb25zdCBidXR0b25Db250YWluZXIgPSBuZXcgT2JzaWRpYW4uU2V0dGluZyhcclxuICAgICAgY29udGFpbmVyRWxcclxuICAgICkuc2V0dGluZ0VsLmNyZWF0ZURpdihcImJ1dHRvbi1jb250YWluZXJcIik7XHJcblxyXG4gICAgLy8gQWRkICdTYXZlIFByb2ZpbGUnIGJ1dHRvblxyXG4gICAgY29uc3Qgc2F2ZUJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIHRleHQ6IFwiU2F2ZSBQcm9maWxlXCIsXHJcbiAgICB9KTtcclxuICAgIHNhdmVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgICAgLy8gR2V0IHRoZSBjdXJyZW50IHZhbHVlcyBmcm9tIHRoZSBmaWVsZHNcclxuICAgICAgY29uc3QgcHJvZmlsZU5hbWUgPSB0aGlzLnByb2ZpbGVOYW1lLmNvbXBvbmVudHNbMF0uaW5wdXRFbC52YWx1ZTsgLy8gUmVwbGFjZSB0aGlzIHdpdGggbG9naWMgdG8gZ2V0IHRoZSBuYW1lXHJcbiAgICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5lbmRwb2ludEZpZWxkLmNvbXBvbmVudHNbMF0uaW5wdXRFbC52YWx1ZTtcclxuICAgICAgY29uc3QgaGVhZGVycyA9IHRoaXMuaGVhZGVyc0ZpZWxkLmNvbXBvbmVudHNbMF0uaW5wdXRFbC52YWx1ZTtcclxuICAgICAgY29uc3QgcmVxdWVzdEJvZHkgPSB0aGlzLnJlcUJvZHlGaWVsZC5jb21wb25lbnRzWzBdLmlucHV0RWwudmFsdWU7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlSlNPTiA9IHRoaXMuanNvblBhdGhGaWVsZC5jb21wb25lbnRzWzBdLmlucHV0RWwudmFsdWU7XHJcblxyXG4gICAgICAvLyBDcmVhdGUgb3IgdXBkYXRlIHRoZSBwcm9maWxlXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9maWxlcy5maW5kSW5kZXgoXHJcbiAgICAgICAgKHApID0+IHAubmFtZSA9PT0gcHJvZmlsZU5hbWVcclxuICAgICAgKTtcclxuICAgICAgaWYgKGV4aXN0aW5nSW5kZXggPj0gMCkge1xyXG4gICAgICAgIC8vIFVwZGF0ZSBleGlzdGluZyBwcm9maWxlXHJcbiAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvZmlsZXNbZXhpc3RpbmdJbmRleF0gPSB7XHJcbiAgICAgICAgICBuYW1lOiBwcm9maWxlTmFtZSxcclxuICAgICAgICAgIGVuZHBvaW50LFxyXG4gICAgICAgICAgaGVhZGVycyxcclxuICAgICAgICAgIHJlcXVlc3RCb2R5LFxyXG4gICAgICAgICAgcmVzcG9uc2VKU09OLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gQWRkIG5ldyBwcm9maWxlXHJcbiAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvZmlsZXMucHVzaCh7XHJcbiAgICAgICAgICBuYW1lOiBwcm9maWxlTmFtZSxcclxuICAgICAgICAgIGVuZHBvaW50LFxyXG4gICAgICAgICAgaGVhZGVycyxcclxuICAgICAgICAgIHJlcXVlc3RCb2R5LFxyXG4gICAgICAgICAgcmVzcG9uc2VKU09OLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBTYXZlIHRoZSB1cGRhdGVkIHNldHRpbmdzXHJcbiAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cclxuICAgICAgLy8gQ2xlYXIgdGhlIGV4aXN0aW5nIG9wdGlvbnNcclxuICAgICAgY29uc3Qgc2VsZWN0RWxlbWVudCA9IHRoaXMucHJvZmlsZURyb3Bkb3duLmNvbXBvbmVudHNbMF0uc2VsZWN0RWw7XHJcbiAgICAgIHNlbGVjdEVsZW1lbnQuaW5uZXJIVE1MID0gXCJcIjtcclxuXHJcbiAgICAgIC8vIFJlcG9wdWxhdGUgdGhlIGRyb3Bkb3duIHdpdGggdGhlIHVwZGF0ZWQgcHJvZmlsZXMgbGlzdFxyXG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9maWxlcy5mb3JFYWNoKChwcm9maWxlLCBpbmRleCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvcHRpb25cIik7XHJcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gaW5kZXgudG9TdHJpbmcoKTtcclxuICAgICAgICBvcHRpb24udGV4dENvbnRlbnQgPSBwcm9maWxlLm5hbWU7XHJcbiAgICAgICAgc2VsZWN0RWxlbWVudC5hcHBlbmRDaGlsZChvcHRpb24pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFVwZGF0ZSB0aGUgc2VsZWN0ZWQgdmFsdWUgb2YgdGhlIGRyb3Bkb3duXHJcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ID49IDApIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleCA9IGV4aXN0aW5nSW5kZXg7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRQcm9maWxlSW5kZXggPVxyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvZmlsZXMubGVuZ3RoIC0gMTtcclxuICAgICAgfVxyXG4gICAgICBzZWxlY3RFbGVtZW50LnZhbHVlID1cclxuICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleC50b1N0cmluZygpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkICdEZWxldGUgUHJvZmlsZScgYnV0dG9uXHJcbiAgICBjb25zdCBkZWxldGVCdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICB0ZXh0OiBcIkRlbGV0ZSBQcm9maWxlXCIsXHJcbiAgICB9KTtcclxuICAgIGRlbGV0ZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICAvLyBMb2dpYyB0byBkZWxldGUgdGhlIHNlbGVjdGVkIHByb2ZpbGVcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkV4Y2x1c2lvbnNcIiB9KTtcclxuICAgIC8vIGxpc3QgZmlsZSBleGNsdXNpb25zXHJcbiAgICBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJmaWxlX2V4Y2x1c2lvbnNcIilcclxuICAgICAgLnNldERlc2MoXCInRXhjbHVkZWQgZmlsZScgbWF0Y2hlcnMgc2VwYXJhdGVkIGJ5IGEgY29tbWEuXCIpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImRyYXdpbmdzLHByb21wdHMvbG9nc1wiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZpbGVfZXhjbHVzaW9ucylcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZmlsZV9leGNsdXNpb25zID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIGxpc3QgZm9sZGVyIGV4Y2x1c2lvbnNcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcImZvbGRlcl9leGNsdXNpb25zXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiJ0V4Y2x1ZGVkIGZvbGRlcicgbWF0Y2hlcnMgc2VwYXJhdGVkIGJ5IGEgY29tbWEuXCIpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImRyYXdpbmdzLHByb21wdHMvbG9nc1wiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZvbGRlcl9leGNsdXNpb25zKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xkZXJfZXhjbHVzaW9ucyA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICAvLyBsaXN0IHBhdGggb25seSBtYXRjaGVyc1xyXG4gICAgbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwicGF0aF9vbmx5XCIpXHJcbiAgICAgIC5zZXREZXNjKFwiJ1BhdGggb25seScgbWF0Y2hlcnMgc2VwYXJhdGVkIGJ5IGEgY29tbWEuXCIpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImRyYXdpbmdzLHByb21wdHMvbG9nc1wiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBhdGhfb25seSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGF0aF9vbmx5ID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIGxpc3QgaGVhZGVyIGV4Y2x1c2lvbnNcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcImhlYWRlcl9leGNsdXNpb25zXCIpXHJcbiAgICAgIC5zZXREZXNjKFxyXG4gICAgICAgIFwiJ0V4Y2x1ZGVkIGhlYWRlcicgbWF0Y2hlcnMgc2VwYXJhdGVkIGJ5IGEgY29tbWEuIFdvcmtzIGZvciAnYmxvY2tzJyBvbmx5LlwiXHJcbiAgICAgIClcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiZHJhd2luZ3MscHJvbXB0cy9sb2dzXCIpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuaGVhZGVyX2V4Y2x1c2lvbnMpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmhlYWRlcl9leGNsdXNpb25zID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwge1xyXG4gICAgICB0ZXh0OiBcIkRpc3BsYXlcIixcclxuICAgIH0pO1xyXG4gICAgLy8gdG9nZ2xlIHNob3dpbmcgZnVsbCBwYXRoIGluIHZpZXdcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcInNob3dfZnVsbF9wYXRoXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiU2hvdyBmdWxsIHBhdGggaW4gdmlldy5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNob3dfZnVsbF9wYXRoKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zaG93X2Z1bGxfcGF0aCA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3ModHJ1ZSk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgLy8gdG9nZ2xlIGV4cGFuZGVkIHZpZXcgYnkgZGVmYXVsdFxyXG4gICAgbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiZXhwYW5kZWRfdmlld1wiKVxyXG4gICAgICAuc2V0RGVzYyhcIkV4cGFuZGVkIHZpZXcgYnkgZGVmYXVsdC5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmV4cGFuZGVkX3ZpZXcpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmV4cGFuZGVkX3ZpZXcgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIHRvZ2dsZSBncm91cCBuZWFyZXN0IGJ5IGZpbGVcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcImdyb3VwX25lYXJlc3RfYnlfZmlsZVwiKVxyXG4gICAgICAuc2V0RGVzYyhcIkdyb3VwIG5lYXJlc3QgYnkgZmlsZS5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmdyb3VwX25lYXJlc3RfYnlfZmlsZSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ3JvdXBfbmVhcmVzdF9ieV9maWxlID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncyh0cnVlKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICAvLyB0b2dnbGUgdmlld19vcGVuIG9uIE9ic2lkaWFuIHN0YXJ0dXBcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcInZpZXdfb3BlblwiKVxyXG4gICAgICAuc2V0RGVzYyhcIk9wZW4gdmlldyBvbiBPYnNpZGlhbiBzdGFydHVwLlwiKVxyXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mudmlld19vcGVuKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy52aWV3X29wZW4gPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwge1xyXG4gICAgICB0ZXh0OiBcIkFkdmFuY2VkXCIsXHJcbiAgICB9KTtcclxuICAgIC8vIHRvZ2dsZSBsb2dfcmVuZGVyXHJcbiAgICBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJsb2dfcmVuZGVyXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiTG9nIHJlbmRlciBkZXRhaWxzIHRvIGNvbnNvbGUgKGluY2x1ZGVzIHRva2VuX3VzYWdlKS5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ19yZW5kZXIpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ19yZW5kZXIgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIHRvZ2dsZSBmaWxlcyBpbiBsb2dfcmVuZGVyXHJcbiAgICBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJsb2dfcmVuZGVyX2ZpbGVzXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiTG9nIGVtYmVkZGVkIG9iamVjdHMgcGF0aHMgd2l0aCBsb2cgcmVuZGVyIChmb3IgZGVidWdnaW5nKS5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ19yZW5kZXJfZmlsZXMpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ19yZW5kZXJfZmlsZXMgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIHRvZ2dsZSBza2lwX3NlY3Rpb25zXHJcbiAgICBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJza2lwX3NlY3Rpb25zXCIpXHJcbiAgICAgIC5zZXREZXNjKFxyXG4gICAgICAgIFwiU2tpcHMgbWFraW5nIGNvbm5lY3Rpb25zIHRvIHNwZWNpZmljIHNlY3Rpb25zIHdpdGhpbiBub3Rlcy4gV2FybmluZzogcmVkdWNlcyB1c2VmdWxuZXNzIGZvciBsYXJnZSBmaWxlcyBhbmQgcmVxdWlyZXMgJ0ZvcmNlIFJlZnJlc2gnIGZvciBzZWN0aW9ucyB0byB3b3JrIGluIHRoZSBmdXR1cmUuXCJcclxuICAgICAgKVxyXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc2tpcF9zZWN0aW9ucylcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2tpcF9zZWN0aW9ucyA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3ModHJ1ZSk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgLy8gdGVzdCBmaWxlIHdyaXRpbmcgYnkgY3JlYXRpbmcgYSB0ZXN0IGZpbGUsIHRoZW4gd3JpdGluZyBhZGRpdGlvbmFsIGRhdGEgdG8gdGhlIGZpbGUsIGFuZCByZXR1cm5pbmcgYW55IGVycm9yIHRleHQgaWYgaXQgZmFpbHNcclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwge1xyXG4gICAgICB0ZXh0OiBcIlRlc3QgRmlsZSBXcml0aW5nXCIsXHJcbiAgICB9KTtcclxuICAgIC8vIG1hbnVhbCBzYXZlIGJ1dHRvblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7XHJcbiAgICAgIHRleHQ6IFwiTWFudWFsIFNhdmVcIixcclxuICAgIH0pO1xyXG4gICAgbGV0IG1hbnVhbF9zYXZlX3Jlc3VsdHMgPSBjb250YWluZXJFbC5jcmVhdGVFbChcImRpdlwiKTtcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIm1hbnVhbF9zYXZlXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiU2F2ZSBjdXJyZW50IGVtYmVkZGluZ3NcIilcclxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxyXG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiTWFudWFsIFNhdmVcIikub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAvLyBjb25maXJtXHJcbiAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIGNvbmZpcm0oXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gc2F2ZSB5b3VyIGN1cnJlbnQgZW1iZWRkaW5ncz9cIilcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAvLyBzYXZlXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZV9lbWJlZGRpbmdzX3RvX2ZpbGUodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgbWFudWFsX3NhdmVfcmVzdWx0cy5pbm5lckhUTUwgPSBcIkVtYmVkZGluZ3Mgc2F2ZWQgc3VjY2Vzc2Z1bGx5LlwiO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgbWFudWFsX3NhdmVfcmVzdWx0cy5pbm5lckhUTUwgPVxyXG4gICAgICAgICAgICAgICAgXCJFbWJlZGRpbmdzIGZhaWxlZCB0byBzYXZlLiBFcnJvcjogXCIgKyBlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICAvLyBsaXN0IHByZXZpb3VzbHkgZmFpbGVkIGZpbGVzXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHtcclxuICAgICAgdGV4dDogXCJQcmV2aW91c2x5IGZhaWxlZCBmaWxlc1wiLFxyXG4gICAgfSk7XHJcbiAgICBsZXQgZmFpbGVkX2xpc3QgPSBjb250YWluZXJFbC5jcmVhdGVFbChcImRpdlwiKTtcclxuICAgIHRoaXMuZHJhd19mYWlsZWRfZmlsZXNfbGlzdChmYWlsZWRfbGlzdCk7XHJcblxyXG4gICAgLy8gZm9yY2UgcmVmcmVzaCBidXR0b25cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwge1xyXG4gICAgICB0ZXh0OiBcIkZvcmNlIFJlZnJlc2hcIixcclxuICAgIH0pO1xyXG4gICAgbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiZm9yY2VfcmVmcmVzaFwiKVxyXG4gICAgICAuc2V0RGVzYyhcclxuICAgICAgICBcIldBUk5JTkc6IERPIE5PVCB1c2UgdW5sZXNzIHlvdSBrbm93IHdoYXQgeW91IGFyZSBkb2luZyEgVGhpcyB3aWxsIGRlbGV0ZSBhbGwgb2YgeW91ciBjdXJyZW50IGVtYmVkZGluZ3MgZnJvbSBPcGVuQUkgYW5kIHRyaWdnZXIgcmVwcm9jZXNzaW5nIG9mIHlvdXIgZW50aXJlIHZhdWx0IVwiXHJcbiAgICAgIClcclxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxyXG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiRm9yY2UgUmVmcmVzaFwiKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgIC8vIGNvbmZpcm1cclxuICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgY29uZmlybShcclxuICAgICAgICAgICAgICBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBGb3JjZSBSZWZyZXNoPyBCeSBjbGlja2luZyB5ZXMgeW91IGNvbmZpcm0gdGhhdCB5b3UgdW5kZXJzdGFuZCB0aGUgY29uc2VxdWVuY2VzIG9mIHRoaXMgYWN0aW9uLlwiXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAvLyBmb3JjZSByZWZyZXNoXHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmZvcmNlX3JlZnJlc2hfZW1iZWRkaW5nc19maWxlKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICB0aGlzLnByb2ZpbGVEcm9wZG93bi5jb21wb25lbnRzWzBdLnNlbGVjdEVsLnZhbHVlID1cclxuICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRQcm9maWxlSW5kZXg7XHJcbiAgICB0aGlzLnNlbGVjdGVkSW5kZXggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleDtcclxuICAgIGlmICh0aGlzLnNlbGVjdGVkSW5kZXggIT0gbnVsbCAmJiB0aGlzLnNlbGVjdGVkSW5kZXggPj0gMCkge1xyXG4gICAgICBhcHBseVByb2ZpbGUoKTsgLy8gQ2FsbCBhcHBseVByb2ZpbGUgdG8gcG9wdWxhdGUgZmllbGRzIHdpdGggc2VsZWN0ZWQgcHJvZmlsZSBkYXRhXHJcbiAgICB9XHJcbiAgICBjb25zb2xlLmxvZyh0aGlzLmVuZHBvaW50RmllbGQuY29tcG9uZW50c1swXS5pbnB1dEVsLnZhbHVlKTtcclxuICB9XHJcblxyXG4gIGRyYXdfZmFpbGVkX2ZpbGVzX2xpc3QoZmFpbGVkX2xpc3QpIHtcclxuICAgIGZhaWxlZF9saXN0LmVtcHR5KCk7XHJcbiAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuZmFpbGVkX2ZpbGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgLy8gYWRkIG1lc3NhZ2UgdGhhdCB0aGVzZSBmaWxlcyB3aWxsIGJlIHNraXBwZWQgdW50aWwgbWFudWFsbHkgcmV0cmllZFxyXG4gICAgICBmYWlsZWRfbGlzdC5jcmVhdGVFbChcInBcIiwge1xyXG4gICAgICAgIHRleHQ6IFwiVGhlIGZvbGxvd2luZyBmaWxlcyBmYWlsZWQgdG8gcHJvY2VzcyBhbmQgd2lsbCBiZSBza2lwcGVkIHVudGlsIG1hbnVhbGx5IHJldHJpZWQuXCIsXHJcbiAgICAgIH0pO1xyXG4gICAgICBsZXQgbGlzdCA9IGZhaWxlZF9saXN0LmNyZWF0ZUVsKFwidWxcIik7XHJcbiAgICAgIGZvciAobGV0IGZhaWxlZF9maWxlIG9mIHRoaXMucGx1Z2luLnNldHRpbmdzLmZhaWxlZF9maWxlcykge1xyXG4gICAgICAgIGxpc3QuY3JlYXRlRWwoXCJsaVwiLCB7XHJcbiAgICAgICAgICB0ZXh0OiBmYWlsZWRfZmlsZSxcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICAvLyBhZGQgYnV0dG9uIHRvIHJldHJ5IGZhaWxlZCBmaWxlcyBvbmx5XHJcbiAgICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGZhaWxlZF9saXN0KVxyXG4gICAgICAgIC5zZXROYW1lKFwicmV0cnlfZmFpbGVkX2ZpbGVzXCIpXHJcbiAgICAgICAgLnNldERlc2MoXCJSZXRyeSBmYWlsZWQgZmlsZXMgb25seVwiKVxyXG4gICAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cclxuICAgICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiUmV0cnkgZmFpbGVkIGZpbGVzIG9ubHlcIikub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIC8vIGNsZWFyIGZhaWxlZF9saXN0IGVsZW1lbnRcclxuICAgICAgICAgICAgZmFpbGVkX2xpc3QuZW1wdHkoKTtcclxuICAgICAgICAgICAgLy8gc2V0IFwicmV0cnlpbmdcIiB0ZXh0XHJcbiAgICAgICAgICAgIGZhaWxlZF9saXN0LmNyZWF0ZUVsKFwicFwiLCB7XHJcbiAgICAgICAgICAgICAgdGV4dDogXCJSZXRyeWluZyBmYWlsZWQgZmlsZXMuLi5cIixcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJldHJ5X2ZhaWxlZF9maWxlcygpO1xyXG4gICAgICAgICAgICAvLyByZWRyYXcgZmFpbGVkIGZpbGVzIGxpc3RcclxuICAgICAgICAgICAgdGhpcy5kcmF3X2ZhaWxlZF9maWxlc19saXN0KGZhaWxlZF9saXN0KTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGZhaWxlZF9saXN0LmNyZWF0ZUVsKFwicFwiLCB7XHJcbiAgICAgICAgdGV4dDogXCJObyBmYWlsZWQgZmlsZXNcIixcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBsaW5lX2lzX2hlYWRpbmcobGluZSkge1xyXG4gIHJldHVybiBsaW5lLmluZGV4T2YoXCIjXCIpID09PSAwICYmIFtcIiNcIiwgXCIgXCJdLmluZGV4T2YobGluZVsxXSkgIT09IC0xO1xyXG59XHJcblxyXG5jb25zdCBTTUFSVF9DT05ORUNUSU9OU19DSEFUX1ZJRVdfVFlQRSA9IFwic21hcnQtY29ubmVjdGlvbnMtY2hhdC12aWV3XCI7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNtYXJ0Q29ubmVjdGlvbnNQbHVnaW47XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7OztBQUFBO0FBQUEsb0JBQUFBLFVBQUFDLFNBQUE7QUFBQSxJQUFBQSxRQUFPLFVBQVUsTUFBTSxRQUFRO0FBQUEsTUFDM0Is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WSxTQUFTLEtBQUs7QUFBQSxZQUN4QixNQUFNO0FBQUEsVUFDUixDQUFDO0FBQ0QsZ0JBQU0sS0FBSyxPQUFPLG1CQUFtQjtBQUVyQyxlQUFLLHVCQUF1QixXQUFXO0FBQUEsUUFDekMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNKLE9BQU87QUFDTCxrQkFBWSxTQUFTLEtBQUs7QUFBQSxRQUN4QixNQUFNO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Y7QUFDRjtBQUVBLFNBQVMsZ0JBQWdCLE1BQU07QUFDN0IsU0FBTyxLQUFLLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLEdBQUcsRUFBRSxRQUFRLEtBQUssQ0FBQyxDQUFDLE1BQU07QUFDcEU7QUFFQSxJQUFNLG1DQUFtQztBQUV6QyxPQUFPLFVBQVU7IiwKICAibmFtZXMiOiBbImV4cG9ydHMiLCAibW9kdWxlIiwgImxpbmVfbGltaXQiLCAiaXRlbSIsICJsaW5rIiwgImZpbGVfbGluayIsICJmaWxlX2xpbmtfbGlzdCJdCn0K
