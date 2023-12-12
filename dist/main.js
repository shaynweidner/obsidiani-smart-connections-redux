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
          await this.init_embeddings_file();
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
      const adjustedResponse = {
        data: [{ embedding: embeddingVector, index: 0 }]
      };
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
      link = link.replace(/#/g, " \xBB ");
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
      await this.plugin.smart_vec_lite.init_embeddings_file(
        profileSpecificFileName
      );
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
      (textArea) => textArea.onChange(() => {
      })
    );
    this.reqBodyField = new Obsidian.Setting(containerEl).setName("Request Body").addTextArea(
      (textArea) => textArea.onChange(() => {
      })
    );
    this.jsonPathField = new Obsidian.Setting(containerEl).setName("Response JSON").addTextArea(
      (textArea) => textArea.onChange(() => {
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
module.exports = SmartConnectionsPlugin;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3ZlY19saXRlLmpzIiwgIi4uL3NyYy9pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsibW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBWZWNMaXRlIHtcclxuICAgIGNvbnN0cnVjdG9yKGNvbmZpZykge1xyXG4gICAgICB0aGlzLmNvbmZpZyA9IHtcclxuICAgICAgICBmaWxlX25hbWU6IFwiZW1iZWRkaW5ncy0zLmpzb25cIixcclxuICAgICAgICBmb2xkZXJfcGF0aDogXCIudmVjX2xpdGVcIixcclxuICAgICAgICBleGlzdHNfYWRhcHRlcjogbnVsbCxcclxuICAgICAgICBta2Rpcl9hZGFwdGVyOiBudWxsLFxyXG4gICAgICAgIHJlYWRfYWRhcHRlcjogbnVsbCxcclxuICAgICAgICByZW5hbWVfYWRhcHRlcjogbnVsbCxcclxuICAgICAgICBzdGF0X2FkYXB0ZXI6IG51bGwsXHJcbiAgICAgICAgd3JpdGVfYWRhcHRlcjogbnVsbCxcclxuICAgICAgICAuLi5jb25maWdcclxuICAgICAgfTtcclxuICAgICAgdGhpcy5maWxlX25hbWUgPSB0aGlzLmNvbmZpZy5maWxlX25hbWU7XHJcbiAgICAgIHRoaXMuZm9sZGVyX3BhdGggPSBjb25maWcuZm9sZGVyX3BhdGg7XHJcbiAgICAgIHRoaXMuZmlsZV9wYXRoID0gdGhpcy5mb2xkZXJfcGF0aCArIFwiL1wiICsgdGhpcy5maWxlX25hbWU7XHJcbiAgICAgIHRoaXMuZW1iZWRkaW5ncyA9IGZhbHNlO1xyXG4gICAgfVxyXG4gICAgYXN5bmMgZmlsZV9leGlzdHMocGF0aCkge1xyXG4gICAgICBpZiAodGhpcy5jb25maWcuZXhpc3RzX2FkYXB0ZXIpIHtcclxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jb25maWcuZXhpc3RzX2FkYXB0ZXIocGF0aCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZXhpc3RzX2FkYXB0ZXIgbm90IHNldFwiKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgYXN5bmMgbWtkaXIocGF0aCkge1xyXG4gICAgICBpZiAodGhpcy5jb25maWcubWtkaXJfYWRhcHRlcikge1xyXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmNvbmZpZy5ta2Rpcl9hZGFwdGVyKHBhdGgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIm1rZGlyX2FkYXB0ZXIgbm90IHNldFwiKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgYXN5bmMgcmVhZF9maWxlKHBhdGgpIHtcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLnJlYWRfYWRhcHRlcikge1xyXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmNvbmZpZy5yZWFkX2FkYXB0ZXIocGF0aCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwicmVhZF9hZGFwdGVyIG5vdCBzZXRcIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGFzeW5jIHJlbmFtZShvbGRfcGF0aCwgbmV3X3BhdGgpIHtcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLnJlbmFtZV9hZGFwdGVyKSB7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuY29uZmlnLnJlbmFtZV9hZGFwdGVyKG9sZF9wYXRoLCBuZXdfcGF0aCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwicmVuYW1lX2FkYXB0ZXIgbm90IHNldFwiKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgYXN5bmMgc3RhdChwYXRoKSB7XHJcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zdGF0X2FkYXB0ZXIpIHtcclxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jb25maWcuc3RhdF9hZGFwdGVyKHBhdGgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcInN0YXRfYWRhcHRlciBub3Qgc2V0XCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBhc3luYyB3cml0ZV9maWxlKHBhdGgsIGRhdGEpIHtcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLndyaXRlX2FkYXB0ZXIpIHtcclxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jb25maWcud3JpdGVfYWRhcHRlcihwYXRoLCBkYXRhKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ3cml0ZV9hZGFwdGVyIG5vdCBzZXRcIik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGFzeW5jIGxvYWQocmV0cmllcyA9IDApIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBlbWJlZGRpbmdzX2ZpbGUgPSBhd2FpdCB0aGlzLnJlYWRfZmlsZSh0aGlzLmZpbGVfcGF0aCk7XHJcbiAgICAgICAgdGhpcy5lbWJlZGRpbmdzID0gSlNPTi5wYXJzZShlbWJlZGRpbmdzX2ZpbGUpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwibG9hZGVkIGVtYmVkZGluZ3MgZmlsZTogXCIgKyB0aGlzLmZpbGVfcGF0aCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgaWYgKHJldHJpZXMgPCAzKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhcInJldHJ5aW5nIGxvYWQoKVwiKTtcclxuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDFlMyArIDFlMyAqIHJldHJpZXMpKTtcclxuICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmxvYWQocmV0cmllcyArIDEpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAocmV0cmllcyA9PT0gMykge1xyXG4gICAgICAgICAgY29uc3QgZW1iZWRkaW5nc18yX2ZpbGVfcGF0aCA9IHRoaXMuZm9sZGVyX3BhdGggKyBcIi9lbWJlZGRpbmdzLTIuanNvblwiO1xyXG4gICAgICAgICAgY29uc3QgZW1iZWRkaW5nc18yX2ZpbGVfZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlX2V4aXN0cyhlbWJlZGRpbmdzXzJfZmlsZV9wYXRoKTtcclxuICAgICAgICAgIGlmIChlbWJlZGRpbmdzXzJfZmlsZV9leGlzdHMpIHtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5taWdyYXRlX2VtYmVkZGluZ3NfdjJfdG9fdjMoKTtcclxuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMubG9hZChyZXRyaWVzICsgMSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiZmFpbGVkIHRvIGxvYWQgZW1iZWRkaW5ncyBmaWxlLCBwcm9tcHQgdXNlciB0byBpbml0aWF0ZSBidWxrIGVtYmVkXCIpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMuaW5pdF9lbWJlZGRpbmdzX2ZpbGUoKTtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGFzeW5jIG1pZ3JhdGVfZW1iZWRkaW5nc192Ml90b192MygpIHtcclxuICAgICAgY29uc29sZS5sb2coXCJtaWdyYXRpbmcgZW1iZWRkaW5ncy0yLmpzb24gdG8gZW1iZWRkaW5ncy0zLmpzb25cIik7XHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZ3NfMl9maWxlX3BhdGggPSB0aGlzLmZvbGRlcl9wYXRoICsgXCIvZW1iZWRkaW5ncy0yLmpzb25cIjtcclxuICAgICAgY29uc3QgZW1iZWRkaW5nc18yX2ZpbGUgPSBhd2FpdCB0aGlzLnJlYWRfZmlsZShlbWJlZGRpbmdzXzJfZmlsZV9wYXRoKTtcclxuICAgICAgY29uc3QgZW1iZWRkaW5nc18yID0gSlNPTi5wYXJzZShlbWJlZGRpbmdzXzJfZmlsZSk7XHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZ3NfMyA9IHt9O1xyXG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhlbWJlZGRpbmdzXzIpKSB7XHJcbiAgICAgICAgY29uc3QgbmV3X29iaiA9IHtcclxuICAgICAgICAgIHZlYzogdmFsdWUudmVjLFxyXG4gICAgICAgICAgbWV0YToge31cclxuICAgICAgICB9O1xyXG4gICAgICAgIGNvbnN0IG1ldGEgPSB2YWx1ZS5tZXRhO1xyXG4gICAgICAgIGNvbnN0IG5ld19tZXRhID0ge307XHJcbiAgICAgICAgaWYgKG1ldGEuaGFzaClcclxuICAgICAgICAgIG5ld19tZXRhLmhhc2ggPSBtZXRhLmhhc2g7XHJcbiAgICAgICAgaWYgKG1ldGEuZmlsZSlcclxuICAgICAgICAgIG5ld19tZXRhLnBhcmVudCA9IG1ldGEuZmlsZTtcclxuICAgICAgICBpZiAobWV0YS5ibG9ja3MpXHJcbiAgICAgICAgICBuZXdfbWV0YS5jaGlsZHJlbiA9IG1ldGEuYmxvY2tzO1xyXG4gICAgICAgIGlmIChtZXRhLm10aW1lKVxyXG4gICAgICAgICAgbmV3X21ldGEubXRpbWUgPSBtZXRhLm10aW1lO1xyXG4gICAgICAgIGlmIChtZXRhLnNpemUpXHJcbiAgICAgICAgICBuZXdfbWV0YS5zaXplID0gbWV0YS5zaXplO1xyXG4gICAgICAgIGlmIChtZXRhLmxlbilcclxuICAgICAgICAgIG5ld19tZXRhLnNpemUgPSBtZXRhLmxlbjtcclxuICAgICAgICBpZiAobWV0YS5wYXRoKVxyXG4gICAgICAgICAgbmV3X21ldGEucGF0aCA9IG1ldGEucGF0aDtcclxuICAgICAgICBuZXdfbWV0YS5zcmMgPSBcImZpbGVcIjtcclxuICAgICAgICBuZXdfb2JqLm1ldGEgPSBuZXdfbWV0YTtcclxuICAgICAgICBlbWJlZGRpbmdzXzNba2V5XSA9IG5ld19vYmo7XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgZW1iZWRkaW5nc18zX2ZpbGUgPSBKU09OLnN0cmluZ2lmeShlbWJlZGRpbmdzXzMpO1xyXG4gICAgICBhd2FpdCB0aGlzLndyaXRlX2ZpbGUodGhpcy5maWxlX3BhdGgsIGVtYmVkZGluZ3NfM19maWxlKTtcclxuICAgIH1cclxuICAgIGFzeW5jIGluaXRfZW1iZWRkaW5nc19maWxlKCkge1xyXG4gICAgICBpZiAoIWF3YWl0IHRoaXMuZmlsZV9leGlzdHModGhpcy5mb2xkZXJfcGF0aCkpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLm1rZGlyKHRoaXMuZm9sZGVyX3BhdGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiY3JlYXRlZCBmb2xkZXI6IFwiICsgdGhpcy5mb2xkZXJfcGF0aCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJmb2xkZXIgYWxyZWFkeSBleGlzdHM6IFwiICsgdGhpcy5mb2xkZXJfcGF0aCk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCFhd2FpdCB0aGlzLmZpbGVfZXhpc3RzKHRoaXMuZmlsZV9wYXRoKSkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMud3JpdGVfZmlsZSh0aGlzLmZpbGVfcGF0aCwgXCJ7fVwiKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcImNyZWF0ZWQgZW1iZWRkaW5ncyBmaWxlOiBcIiArIHRoaXMuZmlsZV9wYXRoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcImVtYmVkZGluZ3MgZmlsZSBhbHJlYWR5IGV4aXN0czogXCIgKyB0aGlzLmZpbGVfcGF0aCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGFzeW5jIHNhdmUoKSB7XHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZ3MgPSBKU09OLnN0cmluZ2lmeSh0aGlzLmVtYmVkZGluZ3MpO1xyXG4gICAgICBjb25zdCBlbWJlZGRpbmdzX2ZpbGVfZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlX2V4aXN0cyh0aGlzLmZpbGVfcGF0aCk7XHJcbiAgICAgIGlmIChlbWJlZGRpbmdzX2ZpbGVfZXhpc3RzKSB7XHJcbiAgICAgICAgY29uc3QgbmV3X2ZpbGVfc2l6ZSA9IGVtYmVkZGluZ3MubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nX2ZpbGVfc2l6ZSA9IGF3YWl0IHRoaXMuc3RhdCh0aGlzLmZpbGVfcGF0aCkudGhlbigoc3RhdCkgPT4gc3RhdC5zaXplKTtcclxuICAgICAgICBpZiAobmV3X2ZpbGVfc2l6ZSA+IGV4aXN0aW5nX2ZpbGVfc2l6ZSAqIDAuNSkge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy53cml0ZV9maWxlKHRoaXMuZmlsZV9wYXRoLCBlbWJlZGRpbmdzKTtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKFwiZW1iZWRkaW5ncyBmaWxlIHNpemU6IFwiICsgbmV3X2ZpbGVfc2l6ZSArIFwiIGJ5dGVzXCIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb25zdCB3YXJuaW5nX21lc3NhZ2UgPSBbXHJcbiAgICAgICAgICAgIFwiV2FybmluZzogTmV3IGVtYmVkZGluZ3MgZmlsZSBzaXplIGlzIHNpZ25pZmljYW50bHkgc21hbGxlciB0aGFuIGV4aXN0aW5nIGVtYmVkZGluZ3MgZmlsZSBzaXplLlwiLFxyXG4gICAgICAgICAgICBcIkFib3J0aW5nIHRvIHByZXZlbnQgcG9zc2libGUgbG9zcyBvZiBlbWJlZGRpbmdzIGRhdGEuXCIsXHJcbiAgICAgICAgICAgIFwiTmV3IGZpbGUgc2l6ZTogXCIgKyBuZXdfZmlsZV9zaXplICsgXCIgYnl0ZXMuXCIsXHJcbiAgICAgICAgICAgIFwiRXhpc3RpbmcgZmlsZSBzaXplOiBcIiArIGV4aXN0aW5nX2ZpbGVfc2l6ZSArIFwiIGJ5dGVzLlwiLFxyXG4gICAgICAgICAgICBcIlJlc3RhcnRpbmcgT2JzaWRpYW4gbWF5IGZpeCB0aGlzLlwiXHJcbiAgICAgICAgICBdO1xyXG4gICAgICAgICAgY29uc29sZS5sb2cod2FybmluZ19tZXNzYWdlLmpvaW4oXCIgXCIpKTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMud3JpdGVfZmlsZSh0aGlzLmZvbGRlcl9wYXRoICsgXCIvdW5zYXZlZC1lbWJlZGRpbmdzLmpzb25cIiwgZW1iZWRkaW5ncyk7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvcjogTmV3IGVtYmVkZGluZ3MgZmlsZSBzaXplIGlzIHNpZ25pZmljYW50bHkgc21hbGxlciB0aGFuIGV4aXN0aW5nIGVtYmVkZGluZ3MgZmlsZSBzaXplLiBBYm9ydGluZyB0byBwcmV2ZW50IHBvc3NpYmxlIGxvc3Mgb2YgZW1iZWRkaW5ncyBkYXRhLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5pbml0X2VtYmVkZGluZ3NfZmlsZSgpO1xyXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNhdmUoKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICAgIGNvc19zaW0odmVjdG9yMSwgdmVjdG9yMikge1xyXG4gICAgICBsZXQgZG90UHJvZHVjdCA9IDA7XHJcbiAgICAgIGxldCBub3JtQSA9IDA7XHJcbiAgICAgIGxldCBub3JtQiA9IDA7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdmVjdG9yMS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGRvdFByb2R1Y3QgKz0gdmVjdG9yMVtpXSAqIHZlY3RvcjJbaV07XHJcbiAgICAgICAgbm9ybUEgKz0gdmVjdG9yMVtpXSAqIHZlY3RvcjFbaV07XHJcbiAgICAgICAgbm9ybUIgKz0gdmVjdG9yMltpXSAqIHZlY3RvcjJbaV07XHJcbiAgICAgIH1cclxuICAgICAgaWYgKG5vcm1BID09PSAwIHx8IG5vcm1CID09PSAwKSB7XHJcbiAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIGRvdFByb2R1Y3QgLyAoTWF0aC5zcXJ0KG5vcm1BKSAqIE1hdGguc3FydChub3JtQikpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBuZWFyZXN0KHRvX3ZlYywgZmlsdGVyID0ge30pIHtcclxuICAgICAgZmlsdGVyID0ge1xyXG4gICAgICAgIHJlc3VsdHNfY291bnQ6IDMwLFxyXG4gICAgICAgIC4uLmZpbHRlclxyXG4gICAgICB9O1xyXG4gICAgICBsZXQgbmVhcmVzdCA9IFtdO1xyXG4gICAgICBjb25zdCBmcm9tX2tleXMgPSBPYmplY3Qua2V5cyh0aGlzLmVtYmVkZGluZ3MpO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZyb21fa2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmIChmaWx0ZXIuc2tpcF9zZWN0aW9ucykge1xyXG4gICAgICAgICAgY29uc3QgZnJvbV9wYXRoID0gdGhpcy5lbWJlZGRpbmdzW2Zyb21fa2V5c1tpXV0ubWV0YS5wYXRoO1xyXG4gICAgICAgICAgaWYgKGZyb21fcGF0aC5pbmRleE9mKFwiI1wiKSA+IC0xKVxyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGZpbHRlci5za2lwX2tleSkge1xyXG4gICAgICAgICAgaWYgKGZpbHRlci5za2lwX2tleSA9PT0gZnJvbV9rZXlzW2ldKVxyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgIGlmIChmaWx0ZXIuc2tpcF9rZXkgPT09IHRoaXMuZW1iZWRkaW5nc1tmcm9tX2tleXNbaV1dLm1ldGEucGFyZW50KVxyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGZpbHRlci5wYXRoX2JlZ2luc193aXRoKSB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIGZpbHRlci5wYXRoX2JlZ2luc193aXRoID09PSBcInN0cmluZ1wiICYmICF0aGlzLmVtYmVkZGluZ3NbZnJvbV9rZXlzW2ldXS5tZXRhLnBhdGguc3RhcnRzV2l0aChmaWx0ZXIucGF0aF9iZWdpbnNfd2l0aCkpXHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZmlsdGVyLnBhdGhfYmVnaW5zX3dpdGgpICYmICFmaWx0ZXIucGF0aF9iZWdpbnNfd2l0aC5zb21lKChwYXRoKSA9PiB0aGlzLmVtYmVkZGluZ3NbZnJvbV9rZXlzW2ldXS5tZXRhLnBhdGguc3RhcnRzV2l0aChwYXRoKSkpXHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBuZWFyZXN0LnB1c2goe1xyXG4gICAgICAgICAgbGluazogdGhpcy5lbWJlZGRpbmdzW2Zyb21fa2V5c1tpXV0ubWV0YS5wYXRoLFxyXG4gICAgICAgICAgc2ltaWxhcml0eTogdGhpcy5jb3Nfc2ltKHRvX3ZlYywgdGhpcy5lbWJlZGRpbmdzW2Zyb21fa2V5c1tpXV0udmVjKSxcclxuICAgICAgICAgIHNpemU6IHRoaXMuZW1iZWRkaW5nc1tmcm9tX2tleXNbaV1dLm1ldGEuc2l6ZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIG5lYXJlc3Quc29ydChmdW5jdGlvbiAoYSwgYikge1xyXG4gICAgICAgIHJldHVybiBiLnNpbWlsYXJpdHkgLSBhLnNpbWlsYXJpdHk7XHJcbiAgICAgIH0pO1xyXG4gICAgICBuZWFyZXN0ID0gbmVhcmVzdC5zbGljZSgwLCBmaWx0ZXIucmVzdWx0c19jb3VudCk7XHJcbiAgICAgIHJldHVybiBuZWFyZXN0O1xyXG4gICAgfVxyXG4gICAgZmluZF9uZWFyZXN0X2VtYmVkZGluZ3ModG9fdmVjLCBmaWx0ZXIgPSB7fSkge1xyXG4gICAgICBjb25zdCBkZWZhdWx0X2ZpbHRlciA9IHtcclxuICAgICAgICBtYXg6IHRoaXMubWF4X3NvdXJjZXNcclxuICAgICAgfTtcclxuICAgICAgZmlsdGVyID0geyAuLi5kZWZhdWx0X2ZpbHRlciwgLi4uZmlsdGVyIH07XHJcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHRvX3ZlYykgJiYgdG9fdmVjLmxlbmd0aCAhPT0gdGhpcy52ZWNfbGVuKSB7XHJcbiAgICAgICAgdGhpcy5uZWFyZXN0ID0ge307XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b192ZWMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgIHRoaXMuZmluZF9uZWFyZXN0X2VtYmVkZGluZ3ModG9fdmVjW2ldLCB7XHJcbiAgICAgICAgICAgIG1heDogTWF0aC5mbG9vcihmaWx0ZXIubWF4IC8gdG9fdmVjLmxlbmd0aClcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zdCBmcm9tX2tleXMgPSBPYmplY3Qua2V5cyh0aGlzLmVtYmVkZGluZ3MpO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZnJvbV9rZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBpZiAodGhpcy52YWxpZGF0ZV90eXBlKHRoaXMuZW1iZWRkaW5nc1tmcm9tX2tleXNbaV1dKSlcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICBjb25zdCBzaW0gPSB0aGlzLmNvbXB1dGVDb3NpbmVTaW1pbGFyaXR5KHRvX3ZlYywgdGhpcy5lbWJlZGRpbmdzW2Zyb21fa2V5c1tpXV0udmVjKTtcclxuICAgICAgICAgIGlmICh0aGlzLm5lYXJlc3RbZnJvbV9rZXlzW2ldXSkge1xyXG4gICAgICAgICAgICB0aGlzLm5lYXJlc3RbZnJvbV9rZXlzW2ldXSArPSBzaW07XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLm5lYXJlc3RbZnJvbV9rZXlzW2ldXSA9IHNpbTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgbGV0IG5lYXJlc3QgPSBPYmplY3Qua2V5cyh0aGlzLm5lYXJlc3QpLm1hcCgoa2V5KSA9PiB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGtleSxcclxuICAgICAgICAgIHNpbWlsYXJpdHk6IHRoaXMubmVhcmVzdFtrZXldXHJcbiAgICAgICAgfTtcclxuICAgICAgfSk7XHJcbiAgICAgIG5lYXJlc3QgPSB0aGlzLnNvcnRfYnlfc2ltaWxhcml0eShuZWFyZXN0KTtcclxuICAgICAgbmVhcmVzdCA9IG5lYXJlc3Quc2xpY2UoMCwgZmlsdGVyLm1heCk7XHJcbiAgICAgIG5lYXJlc3QgPSBuZWFyZXN0Lm1hcCgoaXRlbSkgPT4ge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBsaW5rOiB0aGlzLmVtYmVkZGluZ3NbaXRlbS5rZXldLm1ldGEucGF0aCxcclxuICAgICAgICAgIHNpbWlsYXJpdHk6IGl0ZW0uc2ltaWxhcml0eSxcclxuICAgICAgICAgIGxlbjogdGhpcy5lbWJlZGRpbmdzW2l0ZW0ua2V5XS5tZXRhLmxlbiB8fCB0aGlzLmVtYmVkZGluZ3NbaXRlbS5rZXldLm1ldGEuc2l6ZVxyXG4gICAgICAgIH07XHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm4gbmVhcmVzdDtcclxuICAgIH1cclxuICAgIHNvcnRfYnlfc2ltaWxhcml0eShuZWFyZXN0KSB7XHJcbiAgICAgIHJldHVybiBuZWFyZXN0LnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcclxuICAgICAgICBjb25zdCBhX3Njb3JlID0gYS5zaW1pbGFyaXR5O1xyXG4gICAgICAgIGNvbnN0IGJfc2NvcmUgPSBiLnNpbWlsYXJpdHk7XHJcbiAgICAgICAgaWYgKGFfc2NvcmUgPiBiX3Njb3JlKVxyXG4gICAgICAgICAgcmV0dXJuIC0xO1xyXG4gICAgICAgIGlmIChhX3Njb3JlIDwgYl9zY29yZSlcclxuICAgICAgICAgIHJldHVybiAxO1xyXG4gICAgICAgIHJldHVybiAwO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIC8vIGNoZWNrIGlmIGtleSBmcm9tIGVtYmVkZGluZ3MgZXhpc3RzIGluIGZpbGVzXHJcbiAgICBjbGVhbl91cF9lbWJlZGRpbmdzKGZpbGVzKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKFwiY2xlYW5pbmcgdXAgZW1iZWRkaW5nc1wiKTtcclxuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHRoaXMuZW1iZWRkaW5ncyk7XHJcbiAgICAgIGxldCBkZWxldGVkX2VtYmVkZGluZ3MgPSAwO1xyXG4gICAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XHJcbiAgICAgICAgY29uc3QgcGF0aCA9IHRoaXMuZW1iZWRkaW5nc1trZXldLm1ldGEucGF0aDtcclxuICAgICAgICBpZiAoIWZpbGVzLmZpbmQoKGZpbGUpID0+IHBhdGguc3RhcnRzV2l0aChmaWxlLnBhdGgpKSkge1xyXG4gICAgICAgICAgZGVsZXRlIHRoaXMuZW1iZWRkaW5nc1trZXldO1xyXG4gICAgICAgICAgZGVsZXRlZF9lbWJlZGRpbmdzKys7XHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHBhdGguaW5kZXhPZihcIiNcIikgPiAtMSkge1xyXG4gICAgICAgICAgY29uc3QgcGFyZW50X2tleSA9IHRoaXMuZW1iZWRkaW5nc1trZXldLm1ldGEucGFyZW50O1xyXG4gICAgICAgICAgaWYgKCF0aGlzLmVtYmVkZGluZ3NbcGFyZW50X2tleV0pIHtcclxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuZW1iZWRkaW5nc1trZXldO1xyXG4gICAgICAgICAgICBkZWxldGVkX2VtYmVkZGluZ3MrKztcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoIXRoaXMuZW1iZWRkaW5nc1twYXJlbnRfa2V5XS5tZXRhKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmVtYmVkZGluZ3Nba2V5XTtcclxuICAgICAgICAgICAgZGVsZXRlZF9lbWJlZGRpbmdzKys7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKHRoaXMuZW1iZWRkaW5nc1twYXJlbnRfa2V5XS5tZXRhLmNoaWxkcmVuICYmIHRoaXMuZW1iZWRkaW5nc1twYXJlbnRfa2V5XS5tZXRhLmNoaWxkcmVuLmluZGV4T2Yoa2V5KSA8IDApIHtcclxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuZW1iZWRkaW5nc1trZXldO1xyXG4gICAgICAgICAgICBkZWxldGVkX2VtYmVkZGluZ3MrKztcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB7IGRlbGV0ZWRfZW1iZWRkaW5ncywgdG90YWxfZW1iZWRkaW5nczoga2V5cy5sZW5ndGggfTtcclxuICAgIH1cclxuICAgIGdldChrZXkpIHtcclxuICAgICAgcmV0dXJuIHRoaXMuZW1iZWRkaW5nc1trZXldIHx8IG51bGw7XHJcbiAgICB9XHJcbiAgICBnZXRfbWV0YShrZXkpIHtcclxuICAgICAgY29uc3QgZW1iZWRkaW5nID0gdGhpcy5nZXQoa2V5KTtcclxuICAgICAgaWYgKGVtYmVkZGluZyAmJiBlbWJlZGRpbmcubWV0YSkge1xyXG4gICAgICAgIHJldHVybiBlbWJlZGRpbmcubWV0YTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGdldF9tdGltZShrZXkpIHtcclxuICAgICAgY29uc3QgbWV0YSA9IHRoaXMuZ2V0X21ldGEoa2V5KTtcclxuICAgICAgaWYgKG1ldGEgJiYgbWV0YS5tdGltZSkge1xyXG4gICAgICAgIHJldHVybiBtZXRhLm10aW1lO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgZ2V0X2hhc2goa2V5KSB7XHJcbiAgICAgIGNvbnN0IG1ldGEgPSB0aGlzLmdldF9tZXRhKGtleSk7XHJcbiAgICAgIGlmIChtZXRhICYmIG1ldGEuaGFzaCkge1xyXG4gICAgICAgIHJldHVybiBtZXRhLmhhc2g7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBnZXRfc2l6ZShrZXkpIHtcclxuICAgICAgY29uc3QgbWV0YSA9IHRoaXMuZ2V0X21ldGEoa2V5KTtcclxuICAgICAgaWYgKG1ldGEgJiYgbWV0YS5zaXplKSB7XHJcbiAgICAgICAgcmV0dXJuIG1ldGEuc2l6ZTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIGdldF9jaGlsZHJlbihrZXkpIHtcclxuICAgICAgY29uc3QgbWV0YSA9IHRoaXMuZ2V0X21ldGEoa2V5KTtcclxuICAgICAgaWYgKG1ldGEgJiYgbWV0YS5jaGlsZHJlbikge1xyXG4gICAgICAgIHJldHVybiBtZXRhLmNoaWxkcmVuO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgZ2V0X3ZlYyhrZXkpIHtcclxuICAgICAgY29uc3QgZW1iZWRkaW5nID0gdGhpcy5nZXQoa2V5KTtcclxuICAgICAgaWYgKGVtYmVkZGluZyAmJiBlbWJlZGRpbmcudmVjKSB7XHJcbiAgICAgICAgcmV0dXJuIGVtYmVkZGluZy52ZWM7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBzYXZlX2VtYmVkZGluZyhrZXksIHZlYywgbWV0YSkge1xyXG4gICAgICB0aGlzLmVtYmVkZGluZ3Nba2V5XSA9IHtcclxuICAgICAgICB2ZWMsXHJcbiAgICAgICAgbWV0YVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgbXRpbWVfaXNfY3VycmVudChrZXksIHNvdXJjZV9tdGltZSkge1xyXG4gICAgICBjb25zdCBtdGltZSA9IHRoaXMuZ2V0X210aW1lKGtleSk7XHJcbiAgICAgIGlmIChtdGltZSAmJiBtdGltZSA+PSBzb3VyY2VfbXRpbWUpIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBhc3luYyBmb3JjZV9yZWZyZXNoKCkge1xyXG4gICAgICB0aGlzLmVtYmVkZGluZ3MgPSBudWxsO1xyXG4gICAgICB0aGlzLmVtYmVkZGluZ3MgPSB7fTtcclxuICAgICAgbGV0IGN1cnJlbnRfZGF0ZXRpbWUgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxZTMpO1xyXG4gICAgICBhd2FpdCB0aGlzLnJlbmFtZSh0aGlzLmZpbGVfcGF0aCwgdGhpcy5mb2xkZXJfcGF0aCArIFwiL2VtYmVkZGluZ3MtXCIgKyBjdXJyZW50X2RhdGV0aW1lICsgXCIuanNvblwiKTtcclxuICAgICAgYXdhaXQgdGhpcy5pbml0X2VtYmVkZGluZ3NfZmlsZSgpO1xyXG4gICAgfVxyXG4gIH07XHJcbiAgIiwgImNvbnN0IE9ic2lkaWFuID0gcmVxdWlyZShcIm9ic2lkaWFuXCIpO1xyXG5jb25zdCBWZWNMaXRlID0gcmVxdWlyZShcIi4vdmVjX2xpdGVcIik7XHJcblxyXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTID0ge1xyXG4gIGZpbGVfZXhjbHVzaW9uczogXCJcIixcclxuICBmb2xkZXJfZXhjbHVzaW9uczogXCJcIixcclxuICBoZWFkZXJfZXhjbHVzaW9uczogXCJcIixcclxuICBwYXRoX29ubHk6IFwiXCIsXHJcbiAgc2hvd19mdWxsX3BhdGg6IGZhbHNlLFxyXG4gIGV4cGFuZGVkX3ZpZXc6IHRydWUsXHJcbiAgZ3JvdXBfbmVhcmVzdF9ieV9maWxlOiBmYWxzZSxcclxuICBsYW5ndWFnZTogXCJlblwiLFxyXG4gIGxvZ19yZW5kZXI6IGZhbHNlLFxyXG4gIGxvZ19yZW5kZXJfZmlsZXM6IGZhbHNlLFxyXG4gIHJlY2VudGx5X3NlbnRfcmV0cnlfbm90aWNlOiBmYWxzZSxcclxuICBza2lwX3NlY3Rpb25zOiBmYWxzZSxcclxuICB2aWV3X29wZW46IHRydWUsXHJcbiAgdmVyc2lvbjogXCJcIixcclxufTtcclxuY29uc3QgTUFYX0VNQkVEX1NUUklOR19MRU5HVEggPSAyNTAwMDtcclxuXHJcbmxldCBWRVJTSU9OO1xyXG5jb25zdCBTVVBQT1JURURfRklMRV9UWVBFUyA9IFtcIm1kXCIsIFwiY2FudmFzXCJdO1xyXG5cclxuLy8gcmVxdWlyZSBidWlsdC1pbiBjcnlwdG8gbW9kdWxlXHJcbmNvbnN0IGNyeXB0byA9IHJlcXVpcmUoXCJjcnlwdG9cIik7XHJcbi8vIG1kNSBoYXNoIHVzaW5nIGJ1aWx0IGluIGNyeXB0byBtb2R1bGVcclxuZnVuY3Rpb24gbWQ1KHN0cikge1xyXG4gIHJldHVybiBjcnlwdG8uY3JlYXRlSGFzaChcIm1kNVwiKS51cGRhdGUoc3RyKS5kaWdlc3QoXCJoZXhcIik7XHJcbn1cclxuXHJcbmNsYXNzIFNtYXJ0Q29ubmVjdGlvbnNQbHVnaW4gZXh0ZW5kcyBPYnNpZGlhbi5QbHVnaW4ge1xyXG4gIC8vIGNvbnN0cnVjdG9yXHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICBzdXBlciguLi5hcmd1bWVudHMpO1xyXG4gICAgdGhpcy5hcGkgPSBudWxsO1xyXG4gICAgdGhpcy5lbWJlZGRpbmdzX2xvYWRlZCA9IGZhbHNlO1xyXG4gICAgdGhpcy5maWxlX2V4Y2x1c2lvbnMgPSBbXTtcclxuICAgIHRoaXMuZm9sZGVycyA9IFtdO1xyXG4gICAgdGhpcy5oYXNfbmV3X2VtYmVkZGluZ3MgPSBmYWxzZTtcclxuICAgIHRoaXMuaGVhZGVyX2V4Y2x1c2lvbnMgPSBbXTtcclxuICAgIHRoaXMubmVhcmVzdF9jYWNoZSA9IHt9O1xyXG4gICAgdGhpcy5wYXRoX29ubHkgPSBbXTtcclxuICAgIHRoaXMucmVuZGVyX2xvZyA9IHt9O1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLmRlbGV0ZWRfZW1iZWRkaW5ncyA9IDA7XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cuZXhjbHVzaW9uc19sb2dzID0ge307XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cuZmFpbGVkX2VtYmVkZGluZ3MgPSBbXTtcclxuICAgIHRoaXMucmVuZGVyX2xvZy5maWxlcyA9IFtdO1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLm5ld19lbWJlZGRpbmdzID0gMDtcclxuICAgIHRoaXMucmVuZGVyX2xvZy5za2lwcGVkX2xvd19kZWx0YSA9IHt9O1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLnRva2VuX3VzYWdlID0gMDtcclxuICAgIHRoaXMucmVuZGVyX2xvZy50b2tlbnNfc2F2ZWRfYnlfY2FjaGUgPSAwO1xyXG4gICAgdGhpcy5yZXRyeV9ub3RpY2VfdGltZW91dCA9IG51bGw7XHJcbiAgICB0aGlzLnNhdmVfdGltZW91dCA9IG51bGw7XHJcbiAgICB0aGlzLnNjX2JyYW5kaW5nID0ge307XHJcbiAgICB0aGlzLnNlbGZfcmVmX2t3X3JlZ2V4ID0gbnVsbDtcclxuICAgIHRoaXMudXBkYXRlX2F2YWlsYWJsZSA9IGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgb25sb2FkKCkge1xyXG4gICAgLy8gaW5pdGlhbGl6ZSB3aGVuIGxheW91dCBpcyByZWFkeVxyXG4gICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkodGhpcy5pbml0aWFsaXplLmJpbmQodGhpcykpO1xyXG4gIH1cclxuICBvbnVubG9hZCgpIHtcclxuICAgIHRoaXMub3V0cHV0X3JlbmRlcl9sb2coKTtcclxuICAgIGNvbnNvbGUubG9nKFwidW5sb2FkaW5nIHBsdWdpblwiKTtcclxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5kZXRhY2hMZWF2ZXNPZlR5cGUoU01BUlRfQ09OTkVDVElPTlNfVklFV19UWVBFKTtcclxuICB9XHJcbiAgYXN5bmMgaW5pdGlhbGl6ZSgpIHtcclxuICAgIGNvbnNvbGUubG9nKFwiTG9hZGluZyBTbWFydCBDb25uZWN0aW9ucyBwbHVnaW5cIik7XHJcbiAgICBWRVJTSU9OID0gdGhpcy5tYW5pZmVzdC52ZXJzaW9uO1xyXG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcclxuICAgIHRoaXMuaW5pdGlhbGl6ZVByb2ZpbGVzKCk7XHJcblxyXG4gICAgdGhpcy5hZGRJY29uKCk7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJzYy1maW5kLW5vdGVzXCIsXHJcbiAgICAgIG5hbWU6IFwiRmluZDogTWFrZSBTbWFydCBDb25uZWN0aW9uc1wiLFxyXG4gICAgICBpY29uOiBcInBlbmNpbF9pY29uXCIsXHJcbiAgICAgIGhvdGtleXM6IFtdLFxyXG4gICAgICAvLyBlZGl0b3JDYWxsYmFjazogYXN5bmMgKGVkaXRvcikgPT4ge1xyXG4gICAgICBlZGl0b3JDYWxsYmFjazogYXN5bmMgKGVkaXRvcikgPT4ge1xyXG4gICAgICAgIGlmIChlZGl0b3Iuc29tZXRoaW5nU2VsZWN0ZWQoKSkge1xyXG4gICAgICAgICAgLy8gZ2V0IHNlbGVjdGVkIHRleHRcclxuICAgICAgICAgIGxldCBzZWxlY3RlZF90ZXh0ID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xyXG4gICAgICAgICAgLy8gcmVuZGVyIGNvbm5lY3Rpb25zIGZyb20gc2VsZWN0ZWQgdGV4dFxyXG4gICAgICAgICAgYXdhaXQgdGhpcy5tYWtlX2Nvbm5lY3Rpb25zKHNlbGVjdGVkX3RleHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAvLyBjbGVhciBuZWFyZXN0X2NhY2hlIG9uIG1hbnVhbCBjYWxsIHRvIG1ha2UgY29ubmVjdGlvbnNcclxuICAgICAgICAgIHRoaXMubmVhcmVzdF9jYWNoZSA9IHt9O1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5tYWtlX2Nvbm5lY3Rpb25zKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJzbWFydC1jb25uZWN0aW9ucy12aWV3XCIsXHJcbiAgICAgIG5hbWU6IFwiT3BlbjogVmlldyBTbWFydCBDb25uZWN0aW9uc1wiLFxyXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xyXG4gICAgICAgIHRoaXMub3Blbl92aWV3KCk7XHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuICAgIC8vIG9wZW4gcmFuZG9tIG5vdGUgZnJvbSBuZWFyZXN0IGNhY2hlXHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJzbWFydC1jb25uZWN0aW9ucy1yYW5kb21cIixcclxuICAgICAgbmFtZTogXCJPcGVuOiBSYW5kb20gTm90ZSBmcm9tIFNtYXJ0IENvbm5lY3Rpb25zXCIsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5vcGVuX3JhbmRvbV9ub3RlKCk7XHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuICAgIC8vIGFkZCBzZXR0aW5ncyB0YWJcclxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgU21hcnRDb25uZWN0aW9uc1NldHRpbmdzVGFiKHRoaXMuYXBwLCB0aGlzKSk7XHJcbiAgICAvLyByZWdpc3RlciBtYWluIHZpZXcgdHlwZVxyXG4gICAgdGhpcy5yZWdpc3RlclZpZXcoXHJcbiAgICAgIFNNQVJUX0NPTk5FQ1RJT05TX1ZJRVdfVFlQRSxcclxuICAgICAgKGxlYWYpID0+IG5ldyBTbWFydENvbm5lY3Rpb25zVmlldyhsZWFmLCB0aGlzKVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBpZiB0aGlzIHNldHRpbmdzLnZpZXdfb3BlbiBpcyB0cnVlLCBvcGVuIHZpZXcgb24gc3RhcnR1cFxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3Mudmlld19vcGVuKSB7XHJcbiAgICAgIHRoaXMub3Blbl92aWV3KCk7XHJcbiAgICB9XHJcbiAgICAvLyBvbiBuZXcgdmVyc2lvblxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MudmVyc2lvbiAhPT0gVkVSU0lPTikge1xyXG4gICAgICAvLyB1cGRhdGUgdmVyc2lvblxyXG4gICAgICB0aGlzLnNldHRpbmdzLnZlcnNpb24gPSBWRVJTSU9OO1xyXG4gICAgICAvLyBzYXZlIHNldHRpbmdzXHJcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgIC8vIG9wZW4gdmlld1xyXG4gICAgICB0aGlzLm9wZW5fdmlldygpO1xyXG4gICAgfVxyXG4gICAgLy8gY2hlY2sgZ2l0aHViIHJlbGVhc2UgZW5kcG9pbnQgaWYgdXBkYXRlIGlzIGF2YWlsYWJsZVxyXG4gICAgdGhpcy5hZGRfdG9fZ2l0aWdub3JlKCk7XHJcbiAgICAvKipcclxuICAgICAqIEVYUEVSSU1FTlRBTFxyXG4gICAgICogLSB3aW5kb3ctYmFzZWQgQVBJIGFjY2Vzc1xyXG4gICAgICogLSBjb2RlLWJsb2NrIHJlbmRlcmluZ1xyXG4gICAgICovXHJcbiAgICB0aGlzLmFwaSA9IG5ldyBTY1NlYXJjaEFwaSh0aGlzLmFwcCwgdGhpcyk7XHJcbiAgICAvLyByZWdpc3RlciBBUEkgdG8gZ2xvYmFsIHdpbmRvdyBvYmplY3RcclxuICAgICh3aW5kb3dbXCJTbWFydFNlYXJjaEFwaVwiXSA9IHRoaXMuYXBpKSAmJlxyXG4gICAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IGRlbGV0ZSB3aW5kb3dbXCJTbWFydFNlYXJjaEFwaVwiXSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBpbml0X3ZlY3MoZmlsZV9uYW1lID0gXCJlbWJlZGRpbmdzLTMuanNvblwiKSB7XHJcbiAgICB0aGlzLnNtYXJ0X3ZlY19saXRlID0gbmV3IFZlY0xpdGUoe1xyXG4gICAgICBmaWxlX25hbWU6IGZpbGVfbmFtZSxcclxuICAgICAgZm9sZGVyX3BhdGg6IFwiLnNtYXJ0LWNvbm5lY3Rpb25zXCIsXHJcbiAgICAgIGV4aXN0c19hZGFwdGVyOiB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cy5iaW5kKFxyXG4gICAgICAgIHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXJcclxuICAgICAgKSxcclxuICAgICAgbWtkaXJfYWRhcHRlcjogdGhpcy5hcHAudmF1bHQuYWRhcHRlci5ta2Rpci5iaW5kKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIpLFxyXG4gICAgICByZWFkX2FkYXB0ZXI6IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZC5iaW5kKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIpLFxyXG4gICAgICByZW5hbWVfYWRhcHRlcjogdGhpcy5hcHAudmF1bHQuYWRhcHRlci5yZW5hbWUuYmluZChcclxuICAgICAgICB0aGlzLmFwcC52YXVsdC5hZGFwdGVyXHJcbiAgICAgICksXHJcbiAgICAgIHN0YXRfYWRhcHRlcjogdGhpcy5hcHAudmF1bHQuYWRhcHRlci5zdGF0LmJpbmQodGhpcy5hcHAudmF1bHQuYWRhcHRlciksXHJcbiAgICAgIHdyaXRlX2FkYXB0ZXI6IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIud3JpdGUuYmluZCh0aGlzLmFwcC52YXVsdC5hZGFwdGVyKSxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5lbWJlZGRpbmdzX2xvYWRlZCA9IGF3YWl0IHRoaXMuc21hcnRfdmVjX2xpdGUubG9hZCgpO1xyXG4gICAgcmV0dXJuIHRoaXMuZW1iZWRkaW5nc19sb2FkZWQ7XHJcbiAgfVxyXG5cclxuICBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcclxuICAgIC8vIGxvYWQgZmlsZSBleGNsdXNpb25zIGlmIG5vdCBibGFua1xyXG4gICAgaWYgKFxyXG4gICAgICB0aGlzLnNldHRpbmdzLmZpbGVfZXhjbHVzaW9ucyAmJlxyXG4gICAgICB0aGlzLnNldHRpbmdzLmZpbGVfZXhjbHVzaW9ucy5sZW5ndGggPiAwXHJcbiAgICApIHtcclxuICAgICAgLy8gc3BsaXQgZmlsZSBleGNsdXNpb25zIGludG8gYXJyYXkgYW5kIHRyaW0gd2hpdGVzcGFjZVxyXG4gICAgICB0aGlzLmZpbGVfZXhjbHVzaW9ucyA9IHRoaXMuc2V0dGluZ3MuZmlsZV9leGNsdXNpb25zXHJcbiAgICAgICAgLnNwbGl0KFwiLFwiKVxyXG4gICAgICAgIC5tYXAoKGZpbGUpID0+IHtcclxuICAgICAgICAgIHJldHVybiBmaWxlLnRyaW0oKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIC8vIGxvYWQgZm9sZGVyIGV4Y2x1c2lvbnMgaWYgbm90IGJsYW5rXHJcbiAgICBpZiAoXHJcbiAgICAgIHRoaXMuc2V0dGluZ3MuZm9sZGVyX2V4Y2x1c2lvbnMgJiZcclxuICAgICAgdGhpcy5zZXR0aW5ncy5mb2xkZXJfZXhjbHVzaW9ucy5sZW5ndGggPiAwXHJcbiAgICApIHtcclxuICAgICAgLy8gYWRkIHNsYXNoIHRvIGVuZCBvZiBmb2xkZXIgbmFtZSBpZiBub3QgcHJlc2VudFxyXG4gICAgICBjb25zdCBmb2xkZXJfZXhjbHVzaW9ucyA9IHRoaXMuc2V0dGluZ3MuZm9sZGVyX2V4Y2x1c2lvbnNcclxuICAgICAgICAuc3BsaXQoXCIsXCIpXHJcbiAgICAgICAgLm1hcCgoZm9sZGVyKSA9PiB7XHJcbiAgICAgICAgICAvLyB0cmltIHdoaXRlc3BhY2VcclxuICAgICAgICAgIGZvbGRlciA9IGZvbGRlci50cmltKCk7XHJcbiAgICAgICAgICBpZiAoZm9sZGVyLnNsaWNlKC0xKSAhPT0gXCIvXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZvbGRlciArIFwiL1wiO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZvbGRlcjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgLy8gbWVyZ2UgZm9sZGVyIGV4Y2x1c2lvbnMgd2l0aCBmaWxlIGV4Y2x1c2lvbnNcclxuICAgICAgdGhpcy5maWxlX2V4Y2x1c2lvbnMgPSB0aGlzLmZpbGVfZXhjbHVzaW9ucy5jb25jYXQoZm9sZGVyX2V4Y2x1c2lvbnMpO1xyXG4gICAgfVxyXG4gICAgLy8gbG9hZCBoZWFkZXIgZXhjbHVzaW9ucyBpZiBub3QgYmxhbmtcclxuICAgIGlmIChcclxuICAgICAgdGhpcy5zZXR0aW5ncy5oZWFkZXJfZXhjbHVzaW9ucyAmJlxyXG4gICAgICB0aGlzLnNldHRpbmdzLmhlYWRlcl9leGNsdXNpb25zLmxlbmd0aCA+IDBcclxuICAgICkge1xyXG4gICAgICB0aGlzLmhlYWRlcl9leGNsdXNpb25zID0gdGhpcy5zZXR0aW5ncy5oZWFkZXJfZXhjbHVzaW9uc1xyXG4gICAgICAgIC5zcGxpdChcIixcIilcclxuICAgICAgICAubWFwKChoZWFkZXIpID0+IHtcclxuICAgICAgICAgIHJldHVybiBoZWFkZXIudHJpbSgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgLy8gbG9hZCBwYXRoX29ubHkgaWYgbm90IGJsYW5rXHJcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5wYXRoX29ubHkgJiYgdGhpcy5zZXR0aW5ncy5wYXRoX29ubHkubGVuZ3RoID4gMCkge1xyXG4gICAgICB0aGlzLnBhdGhfb25seSA9IHRoaXMuc2V0dGluZ3MucGF0aF9vbmx5LnNwbGl0KFwiLFwiKS5tYXAoKHBhdGgpID0+IHtcclxuICAgICAgICByZXR1cm4gcGF0aC50cmltKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgLy8gbG9hZCBmYWlsZWQgZmlsZXNcclxuICAgIGF3YWl0IHRoaXMubG9hZF9mYWlsZWRfZmlsZXMoKTtcclxuICB9XHJcbiAgYXN5bmMgc2F2ZVNldHRpbmdzKHJlcmVuZGVyID0gZmFsc2UpIHtcclxuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcbiAgICAvLyByZS1sb2FkIHNldHRpbmdzIGludG8gbWVtb3J5XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xyXG4gICAgLy8gcmUtcmVuZGVyIHZpZXcgaWYgc2V0IHRvIHRydWUgKGZvciBleGFtcGxlLCBhZnRlciBhZGRpbmcgQVBJIGtleSlcclxuICAgIGlmIChyZXJlbmRlcikge1xyXG4gICAgICB0aGlzLm5lYXJlc3RfY2FjaGUgPSB7fTtcclxuICAgICAgYXdhaXQgdGhpcy5tYWtlX2Nvbm5lY3Rpb25zKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBtYWtlX2Nvbm5lY3Rpb25zKHNlbGVjdGVkX3RleHQgPSBudWxsKSB7XHJcbiAgICBsZXQgdmlldyA9IHRoaXMuZ2V0X3ZpZXcoKTtcclxuICAgIGlmICghdmlldykge1xyXG4gICAgICAvLyBvcGVuIHZpZXcgaWYgbm90IG9wZW5cclxuICAgICAgYXdhaXQgdGhpcy5vcGVuX3ZpZXcoKTtcclxuICAgICAgdmlldyA9IHRoaXMuZ2V0X3ZpZXcoKTtcclxuICAgIH1cclxuICAgIGF3YWl0IHZpZXcucmVuZGVyX2Nvbm5lY3Rpb25zKHNlbGVjdGVkX3RleHQpO1xyXG4gIH1cclxuXHJcbiAgYWRkSWNvbigpIHtcclxuICAgIE9ic2lkaWFuLmFkZEljb24oXHJcbiAgICAgIFwic21hcnQtY29ubmVjdGlvbnNcIixcclxuICAgICAgYDxwYXRoIGQ9XCJNNTAsMjAgTDgwLDQwIEw4MCw2MCBMNTAsMTAwXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiNFwiIGZpbGw9XCJub25lXCIvPlxyXG4gICAgPHBhdGggZD1cIk0zMCw1MCBMNTUsNzBcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCI1XCIgZmlsbD1cIm5vbmVcIi8+XHJcbiAgICA8Y2lyY2xlIGN4PVwiNTBcIiBjeT1cIjIwXCIgcj1cIjlcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPlxyXG4gICAgPGNpcmNsZSBjeD1cIjgwXCIgY3k9XCI0MFwiIHI9XCI5XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5cclxuICAgIDxjaXJjbGUgY3g9XCI4MFwiIGN5PVwiNzBcIiByPVwiOVwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+XHJcbiAgICA8Y2lyY2xlIGN4PVwiNTBcIiBjeT1cIjEwMFwiIHI9XCI5XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5cclxuICAgIDxjaXJjbGUgY3g9XCIzMFwiIGN5PVwiNTBcIiByPVwiOVwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+YFxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIC8vIG9wZW4gcmFuZG9tIG5vdGVcclxuICBhc3luYyBvcGVuX3JhbmRvbV9ub3RlKCkge1xyXG4gICAgY29uc3QgY3Vycl9maWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcclxuICAgIGNvbnN0IGN1cnJfa2V5ID0gbWQ1KGN1cnJfZmlsZS5wYXRoKTtcclxuICAgIC8vIGlmIG5vIG5lYXJlc3QgY2FjaGUsIGNyZWF0ZSBPYnNpZGlhbiBub3RpY2VcclxuICAgIGlmICh0eXBlb2YgdGhpcy5uZWFyZXN0X2NhY2hlW2N1cnJfa2V5XSA9PT0gXCJ1bmRlZmluZWRcIikge1xyXG4gICAgICBuZXcgT2JzaWRpYW4uTm90aWNlKFxyXG4gICAgICAgIFwiW1NtYXJ0IENvbm5lY3Rpb25zXSBObyBTbWFydCBDb25uZWN0aW9ucyBmb3VuZC4gT3BlbiBhIG5vdGUgdG8gZ2V0IFNtYXJ0IENvbm5lY3Rpb25zLlwiXHJcbiAgICAgICk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIC8vIGdldCByYW5kb20gZnJvbSBuZWFyZXN0IGNhY2hlXHJcbiAgICBjb25zdCByYW5kID0gTWF0aC5mbG9vcihcclxuICAgICAgKE1hdGgucmFuZG9tKCkgKiB0aGlzLm5lYXJlc3RfY2FjaGVbY3Vycl9rZXldLmxlbmd0aCkgLyAyXHJcbiAgICApOyAvLyBkaXZpZGUgYnkgMiB0byBsaW1pdCB0byB0b3AgaGFsZiBvZiByZXN1bHRzXHJcbiAgICBjb25zdCByYW5kb21fZmlsZSA9IHRoaXMubmVhcmVzdF9jYWNoZVtjdXJyX2tleV1bcmFuZF07XHJcbiAgICAvLyBvcGVuIHJhbmRvbSBmaWxlXHJcbiAgICB0aGlzLm9wZW5fbm90ZShyYW5kb21fZmlsZSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBvcGVuX3ZpZXcoKSB7XHJcbiAgICBpZiAodGhpcy5nZXRfdmlldygpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKFwiU21hcnQgQ29ubmVjdGlvbnMgdmlldyBhbHJlYWR5IG9wZW5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5kZXRhY2hMZWF2ZXNPZlR5cGUoU01BUlRfQ09OTkVDVElPTlNfVklFV19UWVBFKTtcclxuICAgIGF3YWl0IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRSaWdodExlYWYoZmFsc2UpLnNldFZpZXdTdGF0ZSh7XHJcbiAgICAgIHR5cGU6IFNNQVJUX0NPTk5FQ1RJT05TX1ZJRVdfVFlQRSxcclxuICAgICAgYWN0aXZlOiB0cnVlLFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihcclxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShTTUFSVF9DT05ORUNUSU9OU19WSUVXX1RZUEUpWzBdXHJcbiAgICApO1xyXG4gIH1cclxuICAvLyBzb3VyY2U6IGh0dHBzOi8vZ2l0aHViLmNvbS9vYnNpZGlhbm1kL29ic2lkaWFuLXJlbGVhc2VzL2Jsb2IvbWFzdGVyL3BsdWdpbi1yZXZpZXcubWQjYXZvaWQtbWFuYWdpbmctcmVmZXJlbmNlcy10by1jdXN0b20tdmlld3NcclxuICBnZXRfdmlldygpIHtcclxuICAgIGZvciAobGV0IGxlYWYgb2YgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShcclxuICAgICAgU01BUlRfQ09OTkVDVElPTlNfVklFV19UWVBFXHJcbiAgICApKSB7XHJcbiAgICAgIGlmIChsZWFmLnZpZXcgaW5zdGFuY2VvZiBTbWFydENvbm5lY3Rpb25zVmlldykge1xyXG4gICAgICAgIHJldHVybiBsZWFmLnZpZXc7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIGdldCBlbWJlZGRpbmdzIGZvciBhbGwgZmlsZXNcclxuICBhc3luYyBnZXRfYWxsX2VtYmVkZGluZ3MoKSB7XHJcbiAgICAvLyBnZXQgYWxsIGZpbGVzIGluIHZhdWx0IGFuZCBmaWx0ZXIgYWxsIGJ1dCBtYXJrZG93biBhbmQgY2FudmFzIGZpbGVzXHJcbiAgICBjb25zdCBmaWxlcyA9IChhd2FpdCB0aGlzLmFwcC52YXVsdC5nZXRGaWxlcygpKS5maWx0ZXIoXHJcbiAgICAgIChmaWxlKSA9PlxyXG4gICAgICAgIGZpbGUgaW5zdGFuY2VvZiBPYnNpZGlhbi5URmlsZSAmJlxyXG4gICAgICAgIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiIHx8IGZpbGUuZXh0ZW5zaW9uID09PSBcImNhbnZhc1wiKVxyXG4gICAgKTtcclxuICAgIC8vIGNvbnN0IGZpbGVzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpO1xyXG4gICAgLy8gZ2V0IG9wZW4gZmlsZXMgdG8gc2tpcCBpZiBmaWxlIGlzIGN1cnJlbnRseSBvcGVuXHJcbiAgICBjb25zdCBvcGVuX2ZpbGVzID0gdGhpcy5hcHAud29ya3NwYWNlXHJcbiAgICAgIC5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKVxyXG4gICAgICAubWFwKChsZWFmKSA9PiBsZWFmLnZpZXcuZmlsZSk7XHJcbiAgICBjb25zdCBjbGVhbl91cF9sb2cgPSB0aGlzLnNtYXJ0X3ZlY19saXRlLmNsZWFuX3VwX2VtYmVkZGluZ3MoZmlsZXMpO1xyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubG9nX3JlbmRlcikge1xyXG4gICAgICB0aGlzLnJlbmRlcl9sb2cudG90YWxfZmlsZXMgPSBmaWxlcy5sZW5ndGg7XHJcbiAgICAgIHRoaXMucmVuZGVyX2xvZy5kZWxldGVkX2VtYmVkZGluZ3MgPSBjbGVhbl91cF9sb2cuZGVsZXRlZF9lbWJlZGRpbmdzO1xyXG4gICAgICB0aGlzLnJlbmRlcl9sb2cudG90YWxfZW1iZWRkaW5ncyA9IGNsZWFuX3VwX2xvZy50b3RhbF9lbWJlZGRpbmdzO1xyXG4gICAgfVxyXG4gICAgLy8gYmF0Y2ggZW1iZWRkaW5nc1xyXG4gICAgbGV0IGJhdGNoX3Byb21pc2VzID0gW107XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIC8vIHNraXAgaWYgcGF0aCBjb250YWlucyBhICNcclxuICAgICAgaWYgKGZpbGVzW2ldLnBhdGguaW5kZXhPZihcIiNcIikgPiAtMSkge1xyXG4gICAgICAgIHRoaXMubG9nX2V4Y2x1c2lvbihcInBhdGggY29udGFpbnMgI1wiKTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICAvLyBza2lwIGlmIGZpbGUgYWxyZWFkeSBoYXMgZW1iZWRkaW5nIGFuZCBlbWJlZGRpbmcubXRpbWUgaXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGZpbGUubXRpbWVcclxuICAgICAgaWYgKFxyXG4gICAgICAgIHRoaXMuc21hcnRfdmVjX2xpdGUubXRpbWVfaXNfY3VycmVudChcclxuICAgICAgICAgIG1kNShmaWxlc1tpXS5wYXRoKSxcclxuICAgICAgICAgIGZpbGVzW2ldLnN0YXQubXRpbWVcclxuICAgICAgICApXHJcbiAgICAgICkge1xyXG4gICAgICAgIC8vIGxvZyBza2lwcGluZyBmaWxlXHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuICAgICAgLy8gY2hlY2sgaWYgZmlsZSBpcyBpbiBmYWlsZWRfZmlsZXNcclxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZmFpbGVkX2ZpbGVzLmluZGV4T2YoZmlsZXNbaV0ucGF0aCkgPiAtMSkge1xyXG4gICAgICAgIC8vIGxvZyBza2lwcGluZyBmaWxlXHJcbiAgICAgICAgLy8gdXNlIHNldFRpbWVvdXQgdG8gcHJldmVudCBtdWx0aXBsZSBub3RpY2VzXHJcbiAgICAgICAgaWYgKHRoaXMucmV0cnlfbm90aWNlX3RpbWVvdXQpIHtcclxuICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnJldHJ5X25vdGljZV90aW1lb3V0KTtcclxuICAgICAgICAgIHRoaXMucmV0cnlfbm90aWNlX3RpbWVvdXQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBsaW1pdCB0byBvbmUgbm90aWNlIGV2ZXJ5IDEwIG1pbnV0ZXNcclxuICAgICAgICBpZiAoIXRoaXMucmVjZW50bHlfc2VudF9yZXRyeV9ub3RpY2UpIHtcclxuICAgICAgICAgIG5ldyBPYnNpZGlhbi5Ob3RpY2UoXHJcbiAgICAgICAgICAgIFwiU21hcnQgQ29ubmVjdGlvbnM6IFNraXBwaW5nIHByZXZpb3VzbHkgZmFpbGVkIGZpbGUsIHVzZSBidXR0b24gaW4gc2V0dGluZ3MgdG8gcmV0cnlcIlxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIHRoaXMucmVjZW50bHlfc2VudF9yZXRyeV9ub3RpY2UgPSB0cnVlO1xyXG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucmVjZW50bHlfc2VudF9yZXRyeV9ub3RpY2UgPSBmYWxzZTtcclxuICAgICAgICAgIH0sIDYwMDAwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIHNraXAgZmlsZXMgd2hlcmUgcGF0aCBjb250YWlucyBhbnkgZXhjbHVzaW9uc1xyXG4gICAgICBsZXQgc2tpcCA9IGZhbHNlO1xyXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMuZmlsZV9leGNsdXNpb25zLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgaWYgKGZpbGVzW2ldLnBhdGguaW5kZXhPZih0aGlzLmZpbGVfZXhjbHVzaW9uc1tqXSkgPiAtMSkge1xyXG4gICAgICAgICAgc2tpcCA9IHRydWU7XHJcbiAgICAgICAgICB0aGlzLmxvZ19leGNsdXNpb24odGhpcy5maWxlX2V4Y2x1c2lvbnNbal0pO1xyXG4gICAgICAgICAgLy8gYnJlYWsgb3V0IG9mIGxvb3BcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBpZiAoc2tpcCkge1xyXG4gICAgICAgIGNvbnRpbnVlOyAvLyB0byBuZXh0IGZpbGVcclxuICAgICAgfVxyXG4gICAgICAvLyBjaGVjayBpZiBmaWxlIGlzIG9wZW5cclxuICAgICAgaWYgKG9wZW5fZmlsZXMuaW5kZXhPZihmaWxlc1tpXSkgPiAtMSkge1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgLy8gcHVzaCBwcm9taXNlIHRvIGJhdGNoX3Byb21pc2VzXHJcbiAgICAgICAgYmF0Y2hfcHJvbWlzZXMucHVzaCh0aGlzLmdldF9maWxlX2VtYmVkZGluZ3MoZmlsZXNbaV0sIGZhbHNlKSk7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coZXJyb3IpO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGlmIGJhdGNoX3Byb21pc2VzIGxlbmd0aCBpcyAxMFxyXG4gICAgICBpZiAoYmF0Y2hfcHJvbWlzZXMubGVuZ3RoID4gMykge1xyXG4gICAgICAgIC8vIHdhaXQgZm9yIGFsbCBwcm9taXNlcyB0byByZXNvbHZlXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoYmF0Y2hfcHJvbWlzZXMpO1xyXG4gICAgICAgIC8vIGNsZWFyIGJhdGNoX3Byb21pc2VzXHJcbiAgICAgICAgYmF0Y2hfcHJvbWlzZXMgPSBbXTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gc2F2ZSBlbWJlZGRpbmdzIEpTT04gdG8gZmlsZSBldmVyeSAxMDAgZmlsZXMgdG8gc2F2ZSBwcm9ncmVzcyBvbiBidWxrIGVtYmVkZGluZ1xyXG4gICAgICBpZiAoaSA+IDAgJiYgaSAlIDEwMCA9PT0gMCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZV9lbWJlZGRpbmdzX3RvX2ZpbGUoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8gd2FpdCBmb3IgYWxsIHByb21pc2VzIHRvIHJlc29sdmVcclxuICAgIGF3YWl0IFByb21pc2UuYWxsKGJhdGNoX3Byb21pc2VzKTtcclxuICAgIC8vIHdyaXRlIGVtYmVkZGluZ3MgSlNPTiB0byBmaWxlXHJcbiAgICBhd2FpdCB0aGlzLnNhdmVfZW1iZWRkaW5nc190b19maWxlKCk7XHJcbiAgICAvLyBpZiByZW5kZXJfbG9nLmZhaWxlZF9lbWJlZGRpbmdzIHRoZW4gdXBkYXRlIGZhaWxlZF9lbWJlZGRpbmdzLnR4dFxyXG4gICAgaWYgKHRoaXMucmVuZGVyX2xvZy5mYWlsZWRfZW1iZWRkaW5ncy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZV9mYWlsZWRfZW1iZWRkaW5ncygpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgc2F2ZV9lbWJlZGRpbmdzX3RvX2ZpbGUoZm9yY2UgPSBmYWxzZSkge1xyXG4gICAgaWYgKCF0aGlzLmhhc19uZXdfZW1iZWRkaW5ncykge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoIWZvcmNlKSB7XHJcbiAgICAgIC8vIHByZXZlbnQgZXhjZXNzaXZlIHdyaXRlcyB0byBlbWJlZGRpbmdzIGZpbGUgYnkgd2FpdGluZyAxIG1pbnV0ZSBiZWZvcmUgd3JpdGluZ1xyXG4gICAgICBpZiAodGhpcy5zYXZlX3RpbWVvdXQpIHtcclxuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5zYXZlX3RpbWVvdXQpO1xyXG4gICAgICAgIHRoaXMuc2F2ZV90aW1lb3V0ID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLnNhdmVfdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuc2F2ZV9lbWJlZGRpbmdzX3RvX2ZpbGUodHJ1ZSk7XHJcbiAgICAgICAgLy8gY2xlYXIgdGltZW91dFxyXG4gICAgICAgIGlmICh0aGlzLnNhdmVfdGltZW91dCkge1xyXG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuc2F2ZV90aW1lb3V0KTtcclxuICAgICAgICAgIHRoaXMuc2F2ZV90aW1lb3V0ID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgIH0sIDMwMDAwKTtcclxuICAgICAgY29uc29sZS5sb2coXCJzY2hlZHVsZWQgc2F2ZVwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIHVzZSBzbWFydF92ZWNfbGl0ZVxyXG4gICAgICBhd2FpdCB0aGlzLnNtYXJ0X3ZlY19saXRlLnNhdmUoKTtcclxuICAgICAgdGhpcy5oYXNfbmV3X2VtYmVkZGluZ3MgPSBmYWxzZTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGVycm9yKTtcclxuICAgICAgbmV3IE9ic2lkaWFuLk5vdGljZShcIlNtYXJ0IENvbm5lY3Rpb25zOiBcIiArIGVycm9yLm1lc3NhZ2UpO1xyXG4gICAgfVxyXG4gIH1cclxuICAvLyBzYXZlIGZhaWxlZCBlbWJlZGRpbmdzIHRvIGZpbGUgZnJvbSByZW5kZXJfbG9nLmZhaWxlZF9lbWJlZGRpbmdzXHJcbiAgYXN5bmMgc2F2ZV9mYWlsZWRfZW1iZWRkaW5ncygpIHtcclxuICAgIC8vIHdyaXRlIGZhaWxlZF9lbWJlZGRpbmdzIHRvIGZpbGUgb25lIGxpbmUgcGVyIGZhaWxlZCBlbWJlZGRpbmdcclxuICAgIGxldCBmYWlsZWRfZW1iZWRkaW5ncyA9IFtdO1xyXG4gICAgLy8gaWYgZmlsZSBhbHJlYWR5IGV4aXN0cyB0aGVuIHJlYWQgaXRcclxuICAgIGNvbnN0IGZhaWxlZF9lbWJlZGRpbmdzX2ZpbGVfZXhpc3RzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMoXHJcbiAgICAgIFwiLnNtYXJ0LWNvbm5lY3Rpb25zL2ZhaWxlZC1lbWJlZGRpbmdzLnR4dFwiXHJcbiAgICApO1xyXG4gICAgaWYgKGZhaWxlZF9lbWJlZGRpbmdzX2ZpbGVfZXhpc3RzKSB7XHJcbiAgICAgIGZhaWxlZF9lbWJlZGRpbmdzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5yZWFkKFxyXG4gICAgICAgIFwiLnNtYXJ0LWNvbm5lY3Rpb25zL2ZhaWxlZC1lbWJlZGRpbmdzLnR4dFwiXHJcbiAgICAgICk7XHJcbiAgICAgIC8vIHNwbGl0IGZhaWxlZF9lbWJlZGRpbmdzIGludG8gYXJyYXlcclxuICAgICAgZmFpbGVkX2VtYmVkZGluZ3MgPSBmYWlsZWRfZW1iZWRkaW5ncy5zcGxpdChcIlxcclxcblwiKTtcclxuICAgIH1cclxuICAgIC8vIG1lcmdlIGZhaWxlZF9lbWJlZGRpbmdzIHdpdGggcmVuZGVyX2xvZy5mYWlsZWRfZW1iZWRkaW5nc1xyXG4gICAgZmFpbGVkX2VtYmVkZGluZ3MgPSBmYWlsZWRfZW1iZWRkaW5ncy5jb25jYXQoXHJcbiAgICAgIHRoaXMucmVuZGVyX2xvZy5mYWlsZWRfZW1iZWRkaW5nc1xyXG4gICAgKTtcclxuICAgIC8vIHJlbW92ZSBkdXBsaWNhdGVzXHJcbiAgICBmYWlsZWRfZW1iZWRkaW5ncyA9IFsuLi5uZXcgU2V0KGZhaWxlZF9lbWJlZGRpbmdzKV07XHJcbiAgICAvLyBzb3J0IGZhaWxlZF9lbWJlZGRpbmdzIGFycmF5IGFscGhhYmV0aWNhbGx5XHJcbiAgICBmYWlsZWRfZW1iZWRkaW5ncy5zb3J0KCk7XHJcbiAgICAvLyBjb252ZXJ0IGZhaWxlZF9lbWJlZGRpbmdzIGFycmF5IHRvIHN0cmluZ1xyXG4gICAgZmFpbGVkX2VtYmVkZGluZ3MgPSBmYWlsZWRfZW1iZWRkaW5ncy5qb2luKFwiXFxyXFxuXCIpO1xyXG4gICAgLy8gd3JpdGUgZmFpbGVkX2VtYmVkZGluZ3MgdG8gZmlsZVxyXG4gICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci53cml0ZShcclxuICAgICAgXCIuc21hcnQtY29ubmVjdGlvbnMvZmFpbGVkLWVtYmVkZGluZ3MudHh0XCIsXHJcbiAgICAgIGZhaWxlZF9lbWJlZGRpbmdzXHJcbiAgICApO1xyXG4gICAgLy8gcmVsb2FkIGZhaWxlZF9lbWJlZGRpbmdzIHRvIHByZXZlbnQgcmV0cnlpbmcgZmFpbGVkIGZpbGVzIHVudGlsIGV4cGxpY2l0bHkgcmVxdWVzdGVkXHJcbiAgICBhd2FpdCB0aGlzLmxvYWRfZmFpbGVkX2ZpbGVzKCk7XHJcbiAgfVxyXG5cclxuICAvLyBsb2FkIGZhaWxlZCBmaWxlcyBmcm9tIGZhaWxlZC1lbWJlZGRpbmdzLnR4dFxyXG4gIGFzeW5jIGxvYWRfZmFpbGVkX2ZpbGVzKCkge1xyXG4gICAgLy8gY2hlY2sgaWYgZmFpbGVkLWVtYmVkZGluZ3MudHh0IGV4aXN0c1xyXG4gICAgY29uc3QgZmFpbGVkX2VtYmVkZGluZ3NfZmlsZV9leGlzdHMgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyhcclxuICAgICAgXCIuc21hcnQtY29ubmVjdGlvbnMvZmFpbGVkLWVtYmVkZGluZ3MudHh0XCJcclxuICAgICk7XHJcbiAgICBpZiAoIWZhaWxlZF9lbWJlZGRpbmdzX2ZpbGVfZXhpc3RzKSB7XHJcbiAgICAgIHRoaXMuc2V0dGluZ3MuZmFpbGVkX2ZpbGVzID0gW107XHJcbiAgICAgIGNvbnNvbGUubG9nKFwiTm8gZmFpbGVkIGZpbGVzLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgLy8gcmVhZCBmYWlsZWQtZW1iZWRkaW5ncy50eHRcclxuICAgIGNvbnN0IGZhaWxlZF9lbWJlZGRpbmdzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5yZWFkKFxyXG4gICAgICBcIi5zbWFydC1jb25uZWN0aW9ucy9mYWlsZWQtZW1iZWRkaW5ncy50eHRcIlxyXG4gICAgKTtcclxuICAgIC8vIHNwbGl0IGZhaWxlZF9lbWJlZGRpbmdzIGludG8gYXJyYXkgYW5kIHJlbW92ZSBlbXB0eSBsaW5lc1xyXG4gICAgY29uc3QgZmFpbGVkX2VtYmVkZGluZ3NfYXJyYXkgPSBmYWlsZWRfZW1iZWRkaW5ncy5zcGxpdChcIlxcclxcblwiKTtcclxuICAgIC8vIHNwbGl0IGF0ICcjJyBhbmQgcmVkdWNlIGludG8gdW5pcXVlIGZpbGUgcGF0aHNcclxuICAgIGNvbnN0IGZhaWxlZF9maWxlcyA9IGZhaWxlZF9lbWJlZGRpbmdzX2FycmF5XHJcbiAgICAgIC5tYXAoKGVtYmVkZGluZykgPT4gZW1iZWRkaW5nLnNwbGl0KFwiI1wiKVswXSlcclxuICAgICAgLnJlZHVjZShcclxuICAgICAgICAodW5pcXVlLCBpdGVtKSA9PiAodW5pcXVlLmluY2x1ZGVzKGl0ZW0pID8gdW5pcXVlIDogWy4uLnVuaXF1ZSwgaXRlbV0pLFxyXG4gICAgICAgIFtdXHJcbiAgICAgICk7XHJcbiAgICAvLyByZXR1cm4gZmFpbGVkX2ZpbGVzXHJcbiAgICB0aGlzLnNldHRpbmdzLmZhaWxlZF9maWxlcyA9IGZhaWxlZF9maWxlcztcclxuICB9XHJcbiAgLy8gcmV0cnkgZmFpbGVkIGVtYmVkZGluZ3NcclxuICBhc3luYyByZXRyeV9mYWlsZWRfZmlsZXMoKSB7XHJcbiAgICAvLyByZW1vdmUgZmFpbGVkIGZpbGVzIGZyb20gZmFpbGVkX2ZpbGVzXHJcbiAgICB0aGlzLnNldHRpbmdzLmZhaWxlZF9maWxlcyA9IFtdO1xyXG4gICAgLy8gaWYgZmFpbGVkLWVtYmVkZGluZ3MudHh0IGV4aXN0cyB0aGVuIGRlbGV0ZSBpdFxyXG4gICAgY29uc3QgZmFpbGVkX2VtYmVkZGluZ3NfZmlsZV9leGlzdHMgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyhcclxuICAgICAgXCIuc21hcnQtY29ubmVjdGlvbnMvZmFpbGVkLWVtYmVkZGluZ3MudHh0XCJcclxuICAgICk7XHJcbiAgICBpZiAoZmFpbGVkX2VtYmVkZGluZ3NfZmlsZV9leGlzdHMpIHtcclxuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5yZW1vdmUoXHJcbiAgICAgICAgXCIuc21hcnQtY29ubmVjdGlvbnMvZmFpbGVkLWVtYmVkZGluZ3MudHh0XCJcclxuICAgICAgKTtcclxuICAgIH1cclxuICAgIC8vIHJ1biBnZXQgYWxsIGVtYmVkZGluZ3NcclxuICAgIGF3YWl0IHRoaXMuZ2V0X2FsbF9lbWJlZGRpbmdzKCk7XHJcbiAgfVxyXG5cclxuICAvLyBhZGQgLnNtYXJ0LWNvbm5lY3Rpb25zIHRvIC5naXRpZ25vcmUgdG8gcHJldmVudCBpc3N1ZXMgd2l0aCBsYXJnZSwgZnJlcXVlbnRseSB1cGRhdGVkIGVtYmVkZGluZ3MgZmlsZShzKVxyXG4gIGFzeW5jIGFkZF90b19naXRpZ25vcmUoKSB7XHJcbiAgICBpZiAoIShhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyhcIi5naXRpZ25vcmVcIikpKSB7XHJcbiAgICAgIHJldHVybjsgLy8gaWYgLmdpdGlnbm9yZSBkb2Vzbid0IGV4aXN0IHRoZW4gZG9uJ3QgYWRkIC5zbWFydC1jb25uZWN0aW9ucyB0byAuZ2l0aWdub3JlXHJcbiAgICB9XHJcbiAgICBsZXQgZ2l0aWdub3JlX2ZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLnJlYWQoXCIuZ2l0aWdub3JlXCIpO1xyXG4gICAgLy8gaWYgLnNtYXJ0LWNvbm5lY3Rpb25zIG5vdCBpbiAuZ2l0aWdub3JlXHJcbiAgICBpZiAoZ2l0aWdub3JlX2ZpbGUuaW5kZXhPZihcIi5zbWFydC1jb25uZWN0aW9uc1wiKSA8IDApIHtcclxuICAgICAgLy8gYWRkIC5zbWFydC1jb25uZWN0aW9ucyB0byAuZ2l0aWdub3JlXHJcbiAgICAgIGxldCBhZGRfdG9fZ2l0aWdub3JlID1cclxuICAgICAgICBcIlxcblxcbiMgSWdub3JlIFNtYXJ0IENvbm5lY3Rpb25zIGZvbGRlciBiZWNhdXNlIGVtYmVkZGluZ3MgZmlsZSBpcyBsYXJnZSBhbmQgdXBkYXRlZCBmcmVxdWVudGx5XCI7XHJcbiAgICAgIGFkZF90b19naXRpZ25vcmUgKz0gXCJcXG4uc21hcnQtY29ubmVjdGlvbnNcIjtcclxuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci53cml0ZShcclxuICAgICAgICBcIi5naXRpZ25vcmVcIixcclxuICAgICAgICBnaXRpZ25vcmVfZmlsZSArIGFkZF90b19naXRpZ25vcmVcclxuICAgICAgKTtcclxuICAgICAgY29uc29sZS5sb2coXCJhZGRlZCAuc21hcnQtY29ubmVjdGlvbnMgdG8gLmdpdGlnbm9yZVwiKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIGZvcmNlIHJlZnJlc2ggZW1iZWRkaW5ncyBmaWxlIGJ1dCBmaXJzdCByZW5hbWUgZXhpc3RpbmcgZW1iZWRkaW5ncyBmaWxlIHRvIC5zbWFydC1jb25uZWN0aW9ucy9lbWJlZGRpbmdzLVlZWVktTU0tREQuanNvblxyXG4gIGFzeW5jIGZvcmNlX3JlZnJlc2hfZW1iZWRkaW5nc19maWxlKCkge1xyXG4gICAgbmV3IE9ic2lkaWFuLk5vdGljZShcclxuICAgICAgXCJTbWFydCBDb25uZWN0aW9uczogZW1iZWRkaW5ncyBmaWxlIEZvcmNlIFJlZnJlc2hlZCwgbWFraW5nIG5ldyBjb25uZWN0aW9ucy4uLlwiXHJcbiAgICApO1xyXG4gICAgLy8gZm9yY2UgcmVmcmVzaFxyXG4gICAgYXdhaXQgdGhpcy5zbWFydF92ZWNfbGl0ZS5mb3JjZV9yZWZyZXNoKCk7XHJcbiAgICAvLyB0cmlnZ2VyIG1ha2luZyBuZXcgY29ubmVjdGlvbnNcclxuICAgIGF3YWl0IHRoaXMuZ2V0X2FsbF9lbWJlZGRpbmdzKCk7XHJcbiAgICB0aGlzLm91dHB1dF9yZW5kZXJfbG9nKCk7XHJcbiAgICBuZXcgT2JzaWRpYW4uTm90aWNlKFxyXG4gICAgICBcIlNtYXJ0IENvbm5lY3Rpb25zOiBlbWJlZGRpbmdzIGZpbGUgRm9yY2UgUmVmcmVzaGVkLCBuZXcgY29ubmVjdGlvbnMgbWFkZS5cIlxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIC8vIGdldCBlbWJlZGRpbmdzIGZvciBlbWJlZF9pbnB1dFxyXG4gIGFzeW5jIGdldF9maWxlX2VtYmVkZGluZ3MoY3Vycl9maWxlLCBzYXZlID0gdHJ1ZSkge1xyXG4gICAgLy8gbGV0IGJhdGNoX3Byb21pc2VzID0gW107XHJcbiAgICBsZXQgcmVxX2JhdGNoID0gW107XHJcbiAgICBsZXQgYmxvY2tzID0gW107XHJcbiAgICAvLyBpbml0aWF0ZSBjdXJyX2ZpbGVfa2V5IGZyb20gbWQ1KGN1cnJfZmlsZS5wYXRoKVxyXG4gICAgY29uc3QgY3Vycl9maWxlX2tleSA9IG1kNShjdXJyX2ZpbGUucGF0aCk7XHJcbiAgICAvLyBpbnRpYXRlIGZpbGVfZmlsZV9lbWJlZF9pbnB1dCBieSByZW1vdmluZyAubWQgYW5kIGNvbnZlcnRpbmcgZmlsZSBwYXRoIHRvIGJyZWFkY3J1bWJzIChcIiA+IFwiKVxyXG4gICAgbGV0IGZpbGVfZW1iZWRfaW5wdXQgPSBjdXJyX2ZpbGUucGF0aC5yZXBsYWNlKFwiLm1kXCIsIFwiXCIpO1xyXG4gICAgZmlsZV9lbWJlZF9pbnB1dCA9IGZpbGVfZW1iZWRfaW5wdXQucmVwbGFjZSgvXFwvL2csIFwiID4gXCIpO1xyXG4gICAgLy8gZW1iZWQgb24gZmlsZS5uYW1lL3RpdGxlIG9ubHkgaWYgcGF0aF9vbmx5IHBhdGggbWF0Y2hlciBzcGVjaWZpZWQgaW4gc2V0dGluZ3NcclxuICAgIGxldCBwYXRoX29ubHkgPSBmYWxzZTtcclxuICAgIGZvciAobGV0IGogPSAwOyBqIDwgdGhpcy5wYXRoX29ubHkubGVuZ3RoOyBqKyspIHtcclxuICAgICAgaWYgKGN1cnJfZmlsZS5wYXRoLmluZGV4T2YodGhpcy5wYXRoX29ubHlbal0pID4gLTEpIHtcclxuICAgICAgICBwYXRoX29ubHkgPSB0cnVlO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwidGl0bGUgb25seSBmaWxlIHdpdGggbWF0Y2hlcjogXCIgKyB0aGlzLnBhdGhfb25seVtqXSk7XHJcbiAgICAgICAgLy8gYnJlYWsgb3V0IG9mIGxvb3BcclxuICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8gcmV0dXJuIGVhcmx5IGlmIHBhdGhfb25seVxyXG4gICAgaWYgKHBhdGhfb25seSkge1xyXG4gICAgICByZXFfYmF0Y2gucHVzaChbXHJcbiAgICAgICAgY3Vycl9maWxlX2tleSxcclxuICAgICAgICBmaWxlX2VtYmVkX2lucHV0LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIG10aW1lOiBjdXJyX2ZpbGUuc3RhdC5tdGltZSxcclxuICAgICAgICAgIHBhdGg6IGN1cnJfZmlsZS5wYXRoLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0pO1xyXG4gICAgICBhd2FpdCB0aGlzLmdldF9lbWJlZGRpbmdzX2JhdGNoKHJlcV9iYXRjaCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIC8qKlxyXG4gICAgICogQkVHSU4gQ2FudmFzIGZpbGUgdHlwZSBFbWJlZGRpbmdcclxuICAgICAqL1xyXG4gICAgaWYgKGN1cnJfZmlsZS5leHRlbnNpb24gPT09IFwiY2FudmFzXCIpIHtcclxuICAgICAgLy8gZ2V0IGZpbGUgY29udGVudHMgYW5kIHBhcnNlIGFzIEpTT05cclxuICAgICAgY29uc3QgY2FudmFzX2NvbnRlbnRzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChjdXJyX2ZpbGUpO1xyXG4gICAgICBpZiAoXHJcbiAgICAgICAgdHlwZW9mIGNhbnZhc19jb250ZW50cyA9PT0gXCJzdHJpbmdcIiAmJlxyXG4gICAgICAgIGNhbnZhc19jb250ZW50cy5pbmRleE9mKFwibm9kZXNcIikgPiAtMVxyXG4gICAgICApIHtcclxuICAgICAgICBjb25zdCBjYW52YXNfanNvbiA9IEpTT04ucGFyc2UoY2FudmFzX2NvbnRlbnRzKTtcclxuICAgICAgICAvLyBmb3IgZWFjaCBvYmplY3QgaW4gbm9kZXMgYXJyYXlcclxuICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGNhbnZhc19qc29uLm5vZGVzLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgICAvLyBpZiBvYmplY3QgaGFzIHRleHQgcHJvcGVydHlcclxuICAgICAgICAgIGlmIChjYW52YXNfanNvbi5ub2Rlc1tqXS50ZXh0KSB7XHJcbiAgICAgICAgICAgIC8vIGFkZCB0byBmaWxlX2VtYmVkX2lucHV0XHJcbiAgICAgICAgICAgIGZpbGVfZW1iZWRfaW5wdXQgKz0gXCJcXG5cIiArIGNhbnZhc19qc29uLm5vZGVzW2pdLnRleHQ7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAvLyBpZiBvYmplY3QgaGFzIGZpbGUgcHJvcGVydHlcclxuICAgICAgICAgIGlmIChjYW52YXNfanNvbi5ub2Rlc1tqXS5maWxlKSB7XHJcbiAgICAgICAgICAgIC8vIGFkZCB0byBmaWxlX2VtYmVkX2lucHV0XHJcbiAgICAgICAgICAgIGZpbGVfZW1iZWRfaW5wdXQgKz0gXCJcXG5MaW5rOiBcIiArIGNhbnZhc19qc29uLm5vZGVzW2pdLmZpbGU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJlcV9iYXRjaC5wdXNoKFtcclxuICAgICAgICBjdXJyX2ZpbGVfa2V5LFxyXG4gICAgICAgIGZpbGVfZW1iZWRfaW5wdXQsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgbXRpbWU6IGN1cnJfZmlsZS5zdGF0Lm10aW1lLFxyXG4gICAgICAgICAgcGF0aDogY3Vycl9maWxlLnBhdGgsXHJcbiAgICAgICAgfSxcclxuICAgICAgXSk7XHJcbiAgICAgIGF3YWl0IHRoaXMuZ2V0X2VtYmVkZGluZ3NfYmF0Y2gocmVxX2JhdGNoKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQkVHSU4gQmxvY2sgXCJzZWN0aW9uXCIgZW1iZWRkaW5nXHJcbiAgICAgKi9cclxuICAgIC8vIGdldCBmaWxlIGNvbnRlbnRzXHJcbiAgICBjb25zdCBub3RlX2NvbnRlbnRzID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChjdXJyX2ZpbGUpO1xyXG4gICAgbGV0IHByb2Nlc3NlZF9zaW5jZV9sYXN0X3NhdmUgPSAwO1xyXG4gICAgY29uc3Qgbm90ZV9zZWN0aW9ucyA9IHRoaXMuYmxvY2tfcGFyc2VyKG5vdGVfY29udGVudHMsIGN1cnJfZmlsZS5wYXRoKTtcclxuICAgIC8vIGlmIG5vdGUgaGFzIG1vcmUgdGhhbiBvbmUgc2VjdGlvbiAoaWYgb25seSBvbmUgdGhlbiBpdHMgc2FtZSBhcyBmdWxsLWNvbnRlbnQpXHJcbiAgICBpZiAobm90ZV9zZWN0aW9ucy5sZW5ndGggPiAxKSB7XHJcbiAgICAgIC8vIGZvciBlYWNoIHNlY3Rpb24gaW4gZmlsZVxyXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG5vdGVfc2VjdGlvbnMubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAvLyBnZXQgZW1iZWRfaW5wdXQgZm9yIGJsb2NrXHJcbiAgICAgICAgY29uc3QgYmxvY2tfZW1iZWRfaW5wdXQgPSBub3RlX3NlY3Rpb25zW2pdLnRleHQ7XHJcbiAgICAgICAgLy8gZ2V0IGJsb2NrIGtleSBmcm9tIGJsb2NrLnBhdGggKGNvbnRhaW5zIGJvdGggZmlsZS5wYXRoIGFuZCBoZWFkZXIgcGF0aClcclxuICAgICAgICBjb25zdCBibG9ja19rZXkgPSBtZDUobm90ZV9zZWN0aW9uc1tqXS5wYXRoKTtcclxuICAgICAgICBibG9ja3MucHVzaChibG9ja19rZXkpO1xyXG4gICAgICAgIC8vIHNraXAgaWYgbGVuZ3RoIG9mIGJsb2NrX2VtYmVkX2lucHV0IHNhbWUgYXMgbGVuZ3RoIG9mIGVtYmVkZGluZ3NbYmxvY2tfa2V5XS5tZXRhLnNpemVcclxuICAgICAgICAvLyBUT0RPIGNvbnNpZGVyIHJvdW5kaW5nIHRvIG5lYXJlc3QgMTAgb3IgMTAwIGZvciBmdXp6eSBtYXRjaGluZ1xyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgIHRoaXMuc21hcnRfdmVjX2xpdGUuZ2V0X3NpemUoYmxvY2tfa2V5KSA9PT0gYmxvY2tfZW1iZWRfaW5wdXQubGVuZ3RoXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICAvLyBsb2cgc2tpcHBpbmcgZmlsZVxyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGFkZCBoYXNoIHRvIGJsb2NrcyB0byBwcmV2ZW50IGVtcHR5IGJsb2NrcyB0cmlnZ2VyaW5nIGZ1bGwtZmlsZSBlbWJlZGRpbmdcclxuICAgICAgICAvLyBza2lwIGlmIGVtYmVkZGluZ3Mga2V5IGFscmVhZHkgZXhpc3RzIGFuZCBibG9jayBtdGltZSBpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gZmlsZSBtdGltZVxyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgIHRoaXMuc21hcnRfdmVjX2xpdGUubXRpbWVfaXNfY3VycmVudChibG9ja19rZXksIGN1cnJfZmlsZS5zdGF0Lm10aW1lKVxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgLy8gbG9nIHNraXBwaW5nIGZpbGVcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBza2lwIGlmIGhhc2ggaXMgcHJlc2VudCBpbiBlbWJlZGRpbmdzIGFuZCBoYXNoIG9mIGJsb2NrX2VtYmVkX2lucHV0IGlzIGVxdWFsIHRvIGhhc2ggaW4gZW1iZWRkaW5nc1xyXG4gICAgICAgIGNvbnN0IGJsb2NrX2hhc2ggPSBtZDUoYmxvY2tfZW1iZWRfaW5wdXQudHJpbSgpKTtcclxuICAgICAgICBpZiAodGhpcy5zbWFydF92ZWNfbGl0ZS5nZXRfaGFzaChibG9ja19rZXkpID09PSBibG9ja19oYXNoKSB7XHJcbiAgICAgICAgICAvLyBsb2cgc2tpcHBpbmcgZmlsZVxyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBjcmVhdGUgcmVxX2JhdGNoIGZvciBiYXRjaGluZyByZXF1ZXN0c1xyXG4gICAgICAgIHJlcV9iYXRjaC5wdXNoKFtcclxuICAgICAgICAgIGJsb2NrX2tleSxcclxuICAgICAgICAgIGJsb2NrX2VtYmVkX2lucHV0LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBvbGRtdGltZTogY3Vycl9maWxlLnN0YXQubXRpbWUsXHJcbiAgICAgICAgICAgIC8vIGdldCBjdXJyZW50IGRhdGV0aW1lIGFzIHVuaXggdGltZXN0YW1wXHJcbiAgICAgICAgICAgIG10aW1lOiBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICBoYXNoOiBibG9ja19oYXNoLFxyXG4gICAgICAgICAgICBwYXJlbnQ6IGN1cnJfZmlsZV9rZXksXHJcbiAgICAgICAgICAgIHBhdGg6IG5vdGVfc2VjdGlvbnNbal0ucGF0aCxcclxuICAgICAgICAgICAgc2l6ZTogYmxvY2tfZW1iZWRfaW5wdXQubGVuZ3RoLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdKTtcclxuICAgICAgICBpZiAocmVxX2JhdGNoLmxlbmd0aCA+IDkpIHtcclxuICAgICAgICAgIC8vIGFkZCBiYXRjaCB0byBiYXRjaF9wcm9taXNlc1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5nZXRfZW1iZWRkaW5nc19iYXRjaChyZXFfYmF0Y2gpO1xyXG4gICAgICAgICAgcHJvY2Vzc2VkX3NpbmNlX2xhc3Rfc2F2ZSArPSByZXFfYmF0Y2gubGVuZ3RoO1xyXG4gICAgICAgICAgLy8gbG9nIGVtYmVkZGluZ1xyXG4gICAgICAgICAgaWYgKHByb2Nlc3NlZF9zaW5jZV9sYXN0X3NhdmUgPj0gMzApIHtcclxuICAgICAgICAgICAgLy8gd3JpdGUgZW1iZWRkaW5ncyBKU09OIHRvIGZpbGVcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5zYXZlX2VtYmVkZGluZ3NfdG9fZmlsZSgpO1xyXG4gICAgICAgICAgICAvLyByZXNldCBwcm9jZXNzZWRfc2luY2VfbGFzdF9zYXZlXHJcbiAgICAgICAgICAgIHByb2Nlc3NlZF9zaW5jZV9sYXN0X3NhdmUgPSAwO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgLy8gcmVzZXQgcmVxX2JhdGNoXHJcbiAgICAgICAgICByZXFfYmF0Y2ggPSBbXTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIGlmIHJlcV9iYXRjaCBpcyBub3QgZW1wdHlcclxuICAgIGlmIChyZXFfYmF0Y2gubGVuZ3RoID4gMCkge1xyXG4gICAgICAvLyBwcm9jZXNzIHJlbWFpbmluZyByZXFfYmF0Y2hcclxuICAgICAgYXdhaXQgdGhpcy5nZXRfZW1iZWRkaW5nc19iYXRjaChyZXFfYmF0Y2gpO1xyXG4gICAgICByZXFfYmF0Y2ggPSBbXTtcclxuICAgICAgcHJvY2Vzc2VkX3NpbmNlX2xhc3Rfc2F2ZSArPSByZXFfYmF0Y2gubGVuZ3RoO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQkVHSU4gRmlsZSBcImZ1bGwgbm90ZVwiIGVtYmVkZGluZ1xyXG4gICAgICovXHJcblxyXG4gICAgLy8gaWYgZmlsZSBsZW5ndGggaXMgbGVzcyB0aGFuIH44MDAwIHRva2VucyB1c2UgZnVsbCBmaWxlIGNvbnRlbnRzXHJcbiAgICAvLyBlbHNlIGlmIGZpbGUgbGVuZ3RoIGlzIGdyZWF0ZXIgdGhhbiA4MDAwIHRva2VucyBidWlsZCBmaWxlX2VtYmVkX2lucHV0IGZyb20gZmlsZSBoZWFkaW5nc1xyXG4gICAgZmlsZV9lbWJlZF9pbnB1dCArPSBgOlxcbmA7XHJcbiAgICAvKipcclxuICAgICAqIFRPRE86IGltcHJvdmUvcmVmYWN0b3IgdGhlIGZvbGxvd2luZyBcImxhcmdlIGZpbGUgcmVkdWNlIHRvIGhlYWRpbmdzXCIgbG9naWNcclxuICAgICAqL1xyXG4gICAgaWYgKG5vdGVfY29udGVudHMubGVuZ3RoIDwgTUFYX0VNQkVEX1NUUklOR19MRU5HVEgpIHtcclxuICAgICAgZmlsZV9lbWJlZF9pbnB1dCArPSBub3RlX2NvbnRlbnRzO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc3Qgbm90ZV9tZXRhX2NhY2hlID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoY3Vycl9maWxlKTtcclxuICAgICAgLy8gZm9yIGVhY2ggaGVhZGluZyBpbiBmaWxlXHJcbiAgICAgIGlmICh0eXBlb2Ygbm90ZV9tZXRhX2NhY2hlLmhlYWRpbmdzID09PSBcInVuZGVmaW5lZFwiKSB7XHJcbiAgICAgICAgZmlsZV9lbWJlZF9pbnB1dCArPSBub3RlX2NvbnRlbnRzLnN1YnN0cmluZygwLCBNQVhfRU1CRURfU1RSSU5HX0xFTkdUSCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbGV0IG5vdGVfaGVhZGluZ3MgPSBcIlwiO1xyXG4gICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgbm90ZV9tZXRhX2NhY2hlLmhlYWRpbmdzLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgICAvLyBnZXQgaGVhZGluZyBsZXZlbFxyXG4gICAgICAgICAgY29uc3QgaGVhZGluZ19sZXZlbCA9IG5vdGVfbWV0YV9jYWNoZS5oZWFkaW5nc1tqXS5sZXZlbDtcclxuICAgICAgICAgIC8vIGdldCBoZWFkaW5nIHRleHRcclxuICAgICAgICAgIGNvbnN0IGhlYWRpbmdfdGV4dCA9IG5vdGVfbWV0YV9jYWNoZS5oZWFkaW5nc1tqXS5oZWFkaW5nO1xyXG4gICAgICAgICAgLy8gYnVpbGQgbWFya2Rvd24gaGVhZGluZ1xyXG4gICAgICAgICAgbGV0IG1kX2hlYWRpbmcgPSBcIlwiO1xyXG4gICAgICAgICAgZm9yIChsZXQgayA9IDA7IGsgPCBoZWFkaW5nX2xldmVsOyBrKyspIHtcclxuICAgICAgICAgICAgbWRfaGVhZGluZyArPSBcIiNcIjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIC8vIGFkZCBoZWFkaW5nIHRvIG5vdGVfaGVhZGluZ3NcclxuICAgICAgICAgIG5vdGVfaGVhZGluZ3MgKz0gYCR7bWRfaGVhZGluZ30gJHtoZWFkaW5nX3RleHR9XFxuYDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZmlsZV9lbWJlZF9pbnB1dCArPSBub3RlX2hlYWRpbmdzO1xyXG4gICAgICAgIGlmIChmaWxlX2VtYmVkX2lucHV0Lmxlbmd0aCA+IE1BWF9FTUJFRF9TVFJJTkdfTEVOR1RIKSB7XHJcbiAgICAgICAgICBmaWxlX2VtYmVkX2lucHV0ID0gZmlsZV9lbWJlZF9pbnB1dC5zdWJzdHJpbmcoXHJcbiAgICAgICAgICAgIDAsXHJcbiAgICAgICAgICAgIE1BWF9FTUJFRF9TVFJJTkdfTEVOR1RIXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8gc2tpcCBlbWJlZGRpbmcgZnVsbCBmaWxlIGlmIGJsb2NrcyBpcyBub3QgZW1wdHkgYW5kIGFsbCBoYXNoZXMgYXJlIHByZXNlbnQgaW4gZW1iZWRkaW5nc1xyXG4gICAgLy8gYmV0dGVyIHRoYW4gaGFzaGluZyBmaWxlX2VtYmVkX2lucHV0IGJlY2F1c2UgbW9yZSByZXNpbGllbnQgdG8gaW5jb25zZXF1ZW50aWFsIGNoYW5nZXMgKHdoaXRlc3BhY2UgYmV0d2VlbiBoZWFkaW5ncylcclxuICAgIGNvbnN0IGZpbGVfaGFzaCA9IG1kNShmaWxlX2VtYmVkX2lucHV0LnRyaW0oKSk7XHJcbiAgICBjb25zdCBleGlzdGluZ19oYXNoID0gdGhpcy5zbWFydF92ZWNfbGl0ZS5nZXRfaGFzaChjdXJyX2ZpbGVfa2V5KTtcclxuICAgIGlmIChleGlzdGluZ19oYXNoICYmIGZpbGVfaGFzaCA9PT0gZXhpc3RpbmdfaGFzaCkge1xyXG4gICAgICB0aGlzLnVwZGF0ZV9yZW5kZXJfbG9nKGJsb2NrcywgZmlsZV9lbWJlZF9pbnB1dCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBpZiBub3QgYWxyZWFkeSBza2lwcGluZyBhbmQgYmxvY2tzIGFyZSBwcmVzZW50XHJcbiAgICBjb25zdCBleGlzdGluZ19ibG9ja3MgPSB0aGlzLnNtYXJ0X3ZlY19saXRlLmdldF9jaGlsZHJlbihjdXJyX2ZpbGVfa2V5KTtcclxuICAgIGxldCBleGlzdGluZ19oYXNfYWxsX2Jsb2NrcyA9IHRydWU7XHJcbiAgICBpZiAoXHJcbiAgICAgIGV4aXN0aW5nX2Jsb2NrcyAmJlxyXG4gICAgICBBcnJheS5pc0FycmF5KGV4aXN0aW5nX2Jsb2NrcykgJiZcclxuICAgICAgYmxvY2tzLmxlbmd0aCA+IDBcclxuICAgICkge1xyXG4gICAgICAvLyBpZiBhbGwgYmxvY2tzIGFyZSBpbiBleGlzdGluZ19ibG9ja3MgdGhlbiBza2lwIChhbGxvd3MgZGVsZXRpb24gb2Ygc21hbGwgYmxvY2tzIHdpdGhvdXQgdHJpZ2dlcmluZyBmdWxsIGZpbGUgZW1iZWRkaW5nKVxyXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGJsb2Nrcy5sZW5ndGg7IGorKykge1xyXG4gICAgICAgIGlmIChleGlzdGluZ19ibG9ja3MuaW5kZXhPZihibG9ja3Nbal0pID09PSAtMSkge1xyXG4gICAgICAgICAgZXhpc3RpbmdfaGFzX2FsbF9ibG9ja3MgPSBmYWxzZTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8gaWYgZXhpc3RpbmcgaGFzIGFsbCBibG9ja3MgdGhlbiBjaGVjayBmaWxlIHNpemUgZm9yIGRlbHRhXHJcbiAgICBpZiAoZXhpc3RpbmdfaGFzX2FsbF9ibG9ja3MpIHtcclxuICAgICAgLy8gZ2V0IGN1cnJlbnQgbm90ZSBmaWxlIHNpemVcclxuICAgICAgY29uc3QgY3Vycl9maWxlX3NpemUgPSBjdXJyX2ZpbGUuc3RhdC5zaXplO1xyXG4gICAgICAvLyBnZXQgZmlsZSBzaXplIGZyb20gZW1iZWRkaW5nc1xyXG4gICAgICBjb25zdCBwcmV2X2ZpbGVfc2l6ZSA9IHRoaXMuc21hcnRfdmVjX2xpdGUuZ2V0X3NpemUoY3Vycl9maWxlX2tleSk7XHJcbiAgICAgIGlmIChwcmV2X2ZpbGVfc2l6ZSkge1xyXG4gICAgICAgIC8vIGlmIGN1cnIgZmlsZSBzaXplIGlzIGxlc3MgdGhhbiAxMCUgZGlmZmVyZW50IGZyb20gcHJldiBmaWxlIHNpemVcclxuICAgICAgICBjb25zdCBmaWxlX2RlbHRhX3BjdCA9IE1hdGgucm91bmQoXHJcbiAgICAgICAgICAoTWF0aC5hYnMoY3Vycl9maWxlX3NpemUgLSBwcmV2X2ZpbGVfc2l6ZSkgLyBjdXJyX2ZpbGVfc2l6ZSkgKiAxMDBcclxuICAgICAgICApO1xyXG4gICAgICAgIGlmIChmaWxlX2RlbHRhX3BjdCA8IDEwKSB7XHJcbiAgICAgICAgICB0aGlzLnJlbmRlcl9sb2cuc2tpcHBlZF9sb3dfZGVsdGFbY3Vycl9maWxlLm5hbWVdID1cclxuICAgICAgICAgICAgZmlsZV9kZWx0YV9wY3QgKyBcIiVcIjtcclxuICAgICAgICAgIHRoaXMudXBkYXRlX3JlbmRlcl9sb2coYmxvY2tzLCBmaWxlX2VtYmVkX2lucHV0KTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGxldCBtZXRhID0ge1xyXG4gICAgICBtdGltZTogY3Vycl9maWxlLnN0YXQubXRpbWUsXHJcbiAgICAgIGhhc2g6IGZpbGVfaGFzaCxcclxuICAgICAgcGF0aDogY3Vycl9maWxlLnBhdGgsXHJcbiAgICAgIHNpemU6IGN1cnJfZmlsZS5zdGF0LnNpemUsXHJcbiAgICAgIGNoaWxkcmVuOiBibG9ja3MsXHJcbiAgICB9O1xyXG4gICAgLy8gYmF0Y2hfcHJvbWlzZXMucHVzaCh0aGlzLmdldF9lbWJlZGRpbmdzKGN1cnJfZmlsZV9rZXksIGZpbGVfZW1iZWRfaW5wdXQsIG1ldGEpKTtcclxuICAgIHJlcV9iYXRjaC5wdXNoKFtjdXJyX2ZpbGVfa2V5LCBmaWxlX2VtYmVkX2lucHV0LCBtZXRhXSk7XHJcbiAgICAvLyBzZW5kIGJhdGNoIHJlcXVlc3RcclxuICAgIGF3YWl0IHRoaXMuZ2V0X2VtYmVkZGluZ3NfYmF0Y2gocmVxX2JhdGNoKTtcclxuICAgIGlmIChzYXZlKSB7XHJcbiAgICAgIC8vIHdyaXRlIGVtYmVkZGluZ3MgSlNPTiB0byBmaWxlXHJcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZV9lbWJlZGRpbmdzX3RvX2ZpbGUoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHVwZGF0ZV9yZW5kZXJfbG9nKGJsb2NrcywgZmlsZV9lbWJlZF9pbnB1dCkge1xyXG4gICAgaWYgKGJsb2Nrcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIC8vIG11bHRpcGx5IGJ5IDIgYmVjYXVzZSBpbXBsaWVzIHdlIHNhdmVkIHRva2VuIHNwZW5kaW5nIG9uIGJsb2NrcyhzZWN0aW9ucyksIHRvb1xyXG4gICAgICB0aGlzLnJlbmRlcl9sb2cudG9rZW5zX3NhdmVkX2J5X2NhY2hlICs9IGZpbGVfZW1iZWRfaW5wdXQubGVuZ3RoIC8gMjtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIGNhbGMgdG9rZW5zIHNhdmVkIGJ5IGNhY2hlOiBkaXZpZGUgYnkgNCBmb3IgdG9rZW4gZXN0aW1hdGVcclxuICAgICAgdGhpcy5yZW5kZXJfbG9nLnRva2Vuc19zYXZlZF9ieV9jYWNoZSArPSBmaWxlX2VtYmVkX2lucHV0Lmxlbmd0aCAvIDQ7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZXRfZW1iZWRkaW5nc19iYXRjaChyZXFfYmF0Y2gpIHtcclxuICAgIGNvbnNvbGUubG9nKFwiZ2V0X2VtYmVkZGluZ3NfYmF0Y2hcIik7XHJcbiAgICAvLyBpZiByZXFfYmF0Y2ggaXMgZW1wdHkgdGhlbiByZXR1cm5cclxuICAgIGlmIChyZXFfYmF0Y2gubGVuZ3RoID09PSAwKSByZXR1cm47XHJcbiAgICAvLyBjcmVhdGUgYXJyYXJ5IG9mIGVtYmVkX2lucHV0cyBmcm9tIHJlcV9iYXRjaFtpXVsxXVxyXG4gICAgY29uc3QgZW1iZWRfaW5wdXRzID0gcmVxX2JhdGNoLm1hcCgocmVxKSA9PiByZXFbMV0pO1xyXG4gICAgLy8gcmVxdWVzdCBlbWJlZGRpbmdzIGZyb20gZW1iZWRfaW5wdXRzXHJcbiAgICBjb25zdCByZXF1ZXN0UmVzdWx0cyA9IGF3YWl0IHRoaXMucmVxdWVzdF9lbWJlZGRpbmdfZnJvbV9pbnB1dChcclxuICAgICAgZW1iZWRfaW5wdXRzXHJcbiAgICApO1xyXG4gICAgLy8gaWYgcmVxdWVzdFJlc3VsdHMgaXMgbnVsbCB0aGVuIHJldHVyblxyXG4gICAgaWYgKCFyZXF1ZXN0UmVzdWx0cykge1xyXG4gICAgICBjb25zb2xlLmxvZyhcImZhaWxlZCBlbWJlZGRpbmcgYmF0Y2hcIik7XHJcbiAgICAgIC8vIGxvZyBmYWlsZWQgZmlsZSBuYW1lcyB0byByZW5kZXJfbG9nXHJcbiAgICAgIHRoaXMucmVuZGVyX2xvZy5mYWlsZWRfZW1iZWRkaW5ncyA9IFtcclxuICAgICAgICAuLi50aGlzLnJlbmRlcl9sb2cuZmFpbGVkX2VtYmVkZGluZ3MsXHJcbiAgICAgICAgLi4ucmVxX2JhdGNoLm1hcCgocmVxKSA9PiByZXFbMl0ucGF0aCksXHJcbiAgICAgIF07XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIC8vIGlmIHJlcXVlc3RSZXN1bHRzIGlzIG5vdCBudWxsXHJcbiAgICBpZiAocmVxdWVzdFJlc3VsdHMpIHtcclxuICAgICAgdGhpcy5oYXNfbmV3X2VtYmVkZGluZ3MgPSB0cnVlO1xyXG4gICAgICAvLyBhZGQgZW1iZWRkaW5nIGtleSB0byByZW5kZXJfbG9nXHJcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmxvZ19yZW5kZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5sb2dfcmVuZGVyX2ZpbGVzKSB7XHJcbiAgICAgICAgICB0aGlzLnJlbmRlcl9sb2cuZmlsZXMgPSBbXHJcbiAgICAgICAgICAgIC4uLnRoaXMucmVuZGVyX2xvZy5maWxlcyxcclxuICAgICAgICAgICAgLi4ucmVxX2JhdGNoLm1hcCgocmVxKSA9PiByZXFbMl0ucGF0aCksXHJcbiAgICAgICAgICBdO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnJlbmRlcl9sb2cubmV3X2VtYmVkZGluZ3MgKz0gcmVxX2JhdGNoLmxlbmd0aDtcclxuICAgICAgICAvLyBhZGQgdG9rZW4gdXNhZ2UgdG8gcmVuZGVyX2xvZ1xyXG4gICAgICAgIHRoaXMucmVuZGVyX2xvZy50b2tlbl91c2FnZSArPSByZXF1ZXN0UmVzdWx0cy51c2FnZS50b3RhbF90b2tlbnM7XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCByZXF1ZXN0UmVzdWx0cy5kYXRhLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgdmVjID0gcmVxdWVzdFJlc3VsdHMuZGF0YVtpXS5lbWJlZGRpbmc7XHJcbiAgICAgICAgY29uc3QgaW5kZXggPSByZXF1ZXN0UmVzdWx0cy5kYXRhW2ldLmluZGV4O1xyXG4gICAgICAgIGlmICh2ZWMpIHtcclxuICAgICAgICAgIGNvbnN0IGtleSA9IHJlcV9iYXRjaFtpbmRleF1bMF07XHJcbiAgICAgICAgICBjb25zdCBtZXRhID0gcmVxX2JhdGNoW2luZGV4XVsyXTtcclxuICAgICAgICAgIHRoaXMuc21hcnRfdmVjX2xpdGUuc2F2ZV9lbWJlZGRpbmcoa2V5LCB2ZWMsIG1ldGEpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgcmVxdWVzdF9lbWJlZGRpbmdfZnJvbV9pbnB1dChlbWJlZF9pbnB1dCwgcmV0cmllcyA9IDApIHtcclxuICAgIGlmIChlbWJlZF9pbnB1dC5sZW5ndGggPT09IDApIHtcclxuICAgICAgY29uc29sZS5sb2coXCJlbWJlZF9pbnB1dCBpcyBlbXB0eVwiKTtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2VsZWN0ZWRQcm9maWxlID1cclxuICAgICAgdGhpcy5zZXR0aW5ncy5wcm9maWxlc1t0aGlzLnNldHRpbmdzLnNlbGVjdGVkUHJvZmlsZUluZGV4XTtcclxuXHJcbiAgICAvLyBBc3N1bWluZyBzZWxlY3RlZFByb2ZpbGUucmVxdWVzdEJvZHkgaXMgYSBKU09OIHN0cmluZyB3aXRoIGEgcGxhY2Vob2xkZXJcclxuICAgIC8vIFBhcnNlIHRoZSByZXF1ZXN0Qm9keSB0byBhbiBvYmplY3RcclxuICAgIGxldCByZXF1ZXN0Qm9keU9iaiA9IEpTT04ucGFyc2Uoc2VsZWN0ZWRQcm9maWxlLnJlcXVlc3RCb2R5KTtcclxuXHJcbiAgICAvLyBDb252ZXJ0IHRoZSBvYmplY3QgYmFjayB0byBhIHN0cmluZ1xyXG4gICAgbGV0IHJlcXVlc3RCb2R5U3RyID0gSlNPTi5zdHJpbmdpZnkocmVxdWVzdEJvZHlPYmopO1xyXG4gICAgcmVxdWVzdEJvZHlTdHIgPSByZXF1ZXN0Qm9keVN0ci5yZXBsYWNlKFxyXG4gICAgICAvXCJ7ZW1iZWRfaW5wdXR9XCIvZyxcclxuICAgICAgSlNPTi5zdHJpbmdpZnkoZW1iZWRfaW5wdXQpXHJcbiAgICApO1xyXG4gICAgcmVxdWVzdEJvZHlPYmogPSBKU09OLnBhcnNlKHJlcXVlc3RCb2R5U3RyKTtcclxuICAgIC8vIFByZXBhcmUgdGhlIHJlcXVlc3QgcGFyYW1ldGVyc1xyXG4gICAgY29uc3QgcmVxUGFyYW1zID0ge1xyXG4gICAgICB1cmw6IHNlbGVjdGVkUHJvZmlsZS5lbmRwb2ludCxcclxuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdEJvZHlPYmopLCAvLyBDb252ZXJ0IGJhY2sgdG8gSlNPTiBzdHJpbmcgYWZ0ZXIgcmVwbGFjaW5nIGlucHV0XHJcbiAgICAgIGhlYWRlcnM6IEpTT04ucGFyc2Uoc2VsZWN0ZWRQcm9maWxlLmhlYWRlcnMpLCAvLyBQYXJzZSBoZWFkZXJzIGZyb20gSlNPTiBzdHJpbmdcclxuICAgIH07XHJcblxyXG4gICAgbGV0IHJlc3A7XHJcbiAgICB0cnkge1xyXG4gICAgICByZXNwID0gYXdhaXQgKDAsIE9ic2lkaWFuLnJlcXVlc3QpKHJlcVBhcmFtcyk7XHJcbiAgICAgIGxldCBwYXJzZWRSZXNwID0gSlNPTi5wYXJzZShyZXNwKTtcclxuXHJcbiAgICAgIGNvbnN0IGVtYmVkZGluZ1ZlY3RvciA9IGdldEVtYmVkZGluZ1ZlY3RvckZyb21SZXNwb25zZShcclxuICAgICAgICBwYXJzZWRSZXNwLFxyXG4gICAgICAgIHNlbGVjdGVkUHJvZmlsZS5yZXNwb25zZUpTT05cclxuICAgICAgKTtcclxuICAgICAgY29uc3QgYWRqdXN0ZWRSZXNwb25zZSA9IHtcclxuICAgICAgICBkYXRhOiBbeyBlbWJlZGRpbmc6IGVtYmVkZGluZ1ZlY3RvciwgaW5kZXg6IDAgfV0sXHJcbiAgICAgIH07XHJcblxyXG4gICAgICByZXR1cm4gYWRqdXN0ZWRSZXNwb25zZTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIC8vIHJldHJ5IHJlcXVlc3QgaWYgZXJyb3IgaXMgNDI5XHJcbiAgICAgIGlmIChlcnJvci5zdGF0dXMgPT09IDQyOSAmJiByZXRyaWVzIDwgMykge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiZXJyb3Igc3RhdHVzOlwiLCBlcnJvci5zdGF0dXMpO1xyXG4gICAgICAgIHJldHJpZXMrKztcclxuICAgICAgICAvLyBleHBvbmVudGlhbCBiYWNrb2ZmXHJcbiAgICAgICAgY29uc3QgYmFja29mZiA9IE1hdGgucG93KHJldHJpZXMsIDIpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGByZXRyeWluZyByZXF1ZXN0ICg0MjkpIGluICR7YmFja29mZn0gc2Vjb25kcy4uLmApO1xyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDEwMDAgKiBiYWNrb2ZmKSk7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucmVxdWVzdF9lbWJlZGRpbmdfZnJvbV9pbnB1dChlbWJlZF9pbnB1dCwgcmV0cmllcyk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0RW1iZWRkaW5nVmVjdG9yRnJvbVJlc3BvbnNlKHJlc3BvbnNlSnNvbiwgcmVzcG9uc2VGb3JtYXQpIHtcclxuICAgICAgLy8gUGFyc2UgdGhlIHJlc3BvbnNlIGZvcm1hdCBKU09OIHN0cmluZ1xyXG4gICAgICBsZXQgZm9ybWF0T2JqID0gSlNPTi5wYXJzZShyZXNwb25zZUZvcm1hdCk7XHJcblxyXG4gICAgICAvLyBGaW5kIHRoZSBwYXRoIHRvIHRoZSBwbGFjZWhvbGRlciBpbiB0aGUgZm9ybWF0IG9iamVjdFxyXG4gICAgICBsZXQgcGF0aFRvRW1iZWRkaW5nID0gZmluZFBhdGhUb0VtYmVkZGluZyhmb3JtYXRPYmosIFwie2VtYmVkX291dHB1dH1cIik7XHJcblxyXG4gICAgICAvLyBFeHRyYWN0IHRoZSBlbWJlZGRpbmcgdmVjdG9yIGZyb20gdGhlIHJlc3BvbnNlIEpTT04gdXNpbmcgdGhlIGZvdW5kIHBhdGhcclxuICAgICAgbGV0IGVtYmVkZGluZ1ZlY3RvciA9IGdldFZhbHVlQXRQYXRoKHJlc3BvbnNlSnNvbiwgcGF0aFRvRW1iZWRkaW5nKTtcclxuXHJcbiAgICAgIHJldHVybiBlbWJlZGRpbmdWZWN0b3I7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZmluZFBhdGhUb0VtYmVkZGluZyhvYmosIHBsYWNlaG9sZGVyLCBwYXRoID0gXCJcIikge1xyXG4gICAgICBpZiAodHlwZW9mIG9iaiA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICAgIGZvciAobGV0IGtleSBpbiBvYmopIHtcclxuICAgICAgICAgIGlmIChvYmpba2V5XSA9PT0gcGxhY2Vob2xkZXIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhdGggKyAocGF0aCA/IFwiLlwiIDogXCJcIikgKyBrZXk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICAgICAgICBsZXQgcmVzdWx0ID0gZmluZFBhdGhUb0VtYmVkZGluZyhcclxuICAgICAgICAgICAgICBvYmpba2V5XSxcclxuICAgICAgICAgICAgICBwbGFjZWhvbGRlcixcclxuICAgICAgICAgICAgICBwYXRoICsgKHBhdGggPyBcIi5cIiA6IFwiXCIpICsga2V5XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldFZhbHVlQXRQYXRoKG9iaiwgcGF0aCkge1xyXG4gICAgICBsZXQgcGFydHMgPSBwYXRoLnNwbGl0KFwiLlwiKTtcclxuICAgICAgbGV0IGN1cnJlbnQgPSBvYmo7XHJcbiAgICAgIGZvciAobGV0IHBhcnQgb2YgcGFydHMpIHtcclxuICAgICAgICBpZiAoY3VycmVudFtwYXJ0XSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjdXJyZW50ID0gY3VycmVudFtwYXJ0XTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gY3VycmVudDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIG91dHB1dF9yZW5kZXJfbG9nKCkge1xyXG4gICAgLy8gaWYgc2V0dGluZ3MubG9nX3JlbmRlciBpcyB0cnVlXHJcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sb2dfcmVuZGVyKSB7XHJcbiAgICAgIGlmICh0aGlzLnJlbmRlcl9sb2cubmV3X2VtYmVkZGluZ3MgPT09IDApIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gcHJldHR5IHByaW50IHRoaXMucmVuZGVyX2xvZyB0byBjb25zb2xlXHJcbiAgICAgICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkodGhpcy5yZW5kZXJfbG9nLCBudWxsLCAyKSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBjbGVhciByZW5kZXJfbG9nXHJcbiAgICB0aGlzLnJlbmRlcl9sb2cgPSB7fTtcclxuICAgIHRoaXMucmVuZGVyX2xvZy5kZWxldGVkX2VtYmVkZGluZ3MgPSAwO1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLmV4Y2x1c2lvbnNfbG9ncyA9IHt9O1xyXG4gICAgdGhpcy5yZW5kZXJfbG9nLmZhaWxlZF9lbWJlZGRpbmdzID0gW107XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cuZmlsZXMgPSBbXTtcclxuICAgIHRoaXMucmVuZGVyX2xvZy5uZXdfZW1iZWRkaW5ncyA9IDA7XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cuc2tpcHBlZF9sb3dfZGVsdGEgPSB7fTtcclxuICAgIHRoaXMucmVuZGVyX2xvZy50b2tlbl91c2FnZSA9IDA7XHJcbiAgICB0aGlzLnJlbmRlcl9sb2cudG9rZW5zX3NhdmVkX2J5X2NhY2hlID0gMDtcclxuICB9XHJcblxyXG4gIC8vIGZpbmQgY29ubmVjdGlvbnMgYnkgbW9zdCBzaW1pbGFyIHRvIGN1cnJlbnQgbm90ZSBieSBjb3NpbmUgc2ltaWxhcml0eVxyXG4gIGFzeW5jIGZpbmRfbm90ZV9jb25uZWN0aW9ucyhjdXJyZW50X25vdGUgPSBudWxsKSB7XHJcbiAgICAvLyBtZDUgb2YgY3VycmVudCBub3RlIHBhdGhcclxuICAgIGNvbnN0IGN1cnJfa2V5ID0gbWQ1KGN1cnJlbnRfbm90ZS5wYXRoKTtcclxuICAgIC8vIGlmIGluIHRoaXMubmVhcmVzdF9jYWNoZSB0aGVuIHNldCB0byBuZWFyZXN0XHJcbiAgICAvLyBlbHNlIGdldCBuZWFyZXN0XHJcbiAgICBsZXQgbmVhcmVzdCA9IFtdO1xyXG4gICAgaWYgKHRoaXMubmVhcmVzdF9jYWNoZVtjdXJyX2tleV0pIHtcclxuICAgICAgbmVhcmVzdCA9IHRoaXMubmVhcmVzdF9jYWNoZVtjdXJyX2tleV07XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBza2lwIGZpbGVzIHdoZXJlIHBhdGggY29udGFpbnMgYW55IGV4Y2x1c2lvbnNcclxuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCB0aGlzLmZpbGVfZXhjbHVzaW9ucy5sZW5ndGg7IGorKykge1xyXG4gICAgICAgIGlmIChjdXJyZW50X25vdGUucGF0aC5pbmRleE9mKHRoaXMuZmlsZV9leGNsdXNpb25zW2pdKSA+IC0xKSB7XHJcbiAgICAgICAgICB0aGlzLmxvZ19leGNsdXNpb24odGhpcy5maWxlX2V4Y2x1c2lvbnNbal0pO1xyXG4gICAgICAgICAgLy8gYnJlYWsgb3V0IG9mIGxvb3AgYW5kIGZpbmlzaCBoZXJlXHJcbiAgICAgICAgICByZXR1cm4gXCJleGNsdWRlZFwiO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICAvLyBnZXQgYWxsIGVtYmVkZGluZ3NcclxuICAgICAgLy8gYXdhaXQgdGhpcy5nZXRfYWxsX2VtYmVkZGluZ3MoKTtcclxuICAgICAgLy8gd3JhcCBnZXQgYWxsIGluIHNldFRpbWVvdXQgdG8gYWxsb3cgZm9yIFVJIHRvIHVwZGF0ZVxyXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICB0aGlzLmdldF9hbGxfZW1iZWRkaW5ncygpO1xyXG4gICAgICB9LCAzMDAwKTtcclxuICAgICAgLy8gZ2V0IGZyb20gY2FjaGUgaWYgbXRpbWUgaXMgc2FtZSBhbmQgdmFsdWVzIGFyZSBub3QgZW1wdHlcclxuICAgICAgaWYgKFxyXG4gICAgICAgIHRoaXMuc21hcnRfdmVjX2xpdGUubXRpbWVfaXNfY3VycmVudChjdXJyX2tleSwgY3VycmVudF9ub3RlLnN0YXQubXRpbWUpXHJcbiAgICAgICkge1xyXG4gICAgICAgIC8vIHNraXBwaW5nIGdldCBmaWxlIGVtYmVkZGluZ3MgYmVjYXVzZSBub3RoaW5nIGhhcyBjaGFuZ2VkXHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gZ2V0IGZpbGUgZW1iZWRkaW5nc1xyXG4gICAgICAgIGF3YWl0IHRoaXMuZ2V0X2ZpbGVfZW1iZWRkaW5ncyhjdXJyZW50X25vdGUpO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGdldCBjdXJyZW50IG5vdGUgZW1iZWRkaW5nIHZlY3RvclxyXG4gICAgICBjb25zdCB2ZWMgPSB0aGlzLnNtYXJ0X3ZlY19saXRlLmdldF92ZWMoY3Vycl9rZXkpO1xyXG4gICAgICBpZiAoIXZlYykge1xyXG4gICAgICAgIHJldHVybiBcIkVycm9yIGdldHRpbmcgZW1iZWRkaW5ncyBmb3I6IFwiICsgY3VycmVudF9ub3RlLnBhdGg7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIGNvbXB1dGUgY29zaW5lIHNpbWlsYXJpdHkgYmV0d2VlbiBjdXJyZW50IG5vdGUgYW5kIGFsbCBvdGhlciBub3RlcyB2aWEgZW1iZWRkaW5nc1xyXG4gICAgICBuZWFyZXN0ID0gdGhpcy5zbWFydF92ZWNfbGl0ZS5uZWFyZXN0KHZlYywge1xyXG4gICAgICAgIHNraXBfa2V5OiBjdXJyX2tleSxcclxuICAgICAgICBza2lwX3NlY3Rpb25zOiB0aGlzLnNldHRpbmdzLnNraXBfc2VjdGlvbnMsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gc2F2ZSB0byB0aGlzLm5lYXJlc3RfY2FjaGVcclxuICAgICAgdGhpcy5uZWFyZXN0X2NhY2hlW2N1cnJfa2V5XSA9IG5lYXJlc3Q7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gcmV0dXJuIGFycmF5IHNvcnRlZCBieSBjb3NpbmUgc2ltaWxhcml0eVxyXG4gICAgcmV0dXJuIG5lYXJlc3Q7XHJcbiAgfVxyXG5cclxuICAvLyBjcmVhdGUgcmVuZGVyX2xvZyBvYmplY3Qgb2YgZXhsdXNpb25zIHdpdGggbnVtYmVyIG9mIHRpbWVzIHNraXBwZWQgYXMgdmFsdWVcclxuICBsb2dfZXhjbHVzaW9uKGV4Y2x1c2lvbikge1xyXG4gICAgLy8gaW5jcmVtZW50IHJlbmRlcl9sb2cgZm9yIHNraXBwZWQgZmlsZVxyXG4gICAgdGhpcy5yZW5kZXJfbG9nLmV4Y2x1c2lvbnNfbG9nc1tleGNsdXNpb25dID1cclxuICAgICAgKHRoaXMucmVuZGVyX2xvZy5leGNsdXNpb25zX2xvZ3NbZXhjbHVzaW9uXSB8fCAwKSArIDE7XHJcbiAgfVxyXG5cclxuICBibG9ja19wYXJzZXIobWFya2Rvd24sIGZpbGVfcGF0aCkge1xyXG4gICAgLy8gaWYgdGhpcy5zZXR0aW5ncy5za2lwX3NlY3Rpb25zIGlzIHRydWUgdGhlbiByZXR1cm4gZW1wdHkgYXJyYXlcclxuICAgIGlmICh0aGlzLnNldHRpbmdzLnNraXBfc2VjdGlvbnMpIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG4gICAgLy8gc3BsaXQgdGhlIG1hcmtkb3duIGludG8gbGluZXNcclxuICAgIGNvbnN0IGxpbmVzID0gbWFya2Rvd24uc3BsaXQoXCJcXG5cIik7XHJcbiAgICAvLyBpbml0aWFsaXplIHRoZSBibG9ja3MgYXJyYXlcclxuICAgIGxldCBibG9ja3MgPSBbXTtcclxuICAgIC8vIGN1cnJlbnQgaGVhZGVycyBhcnJheVxyXG4gICAgbGV0IGN1cnJlbnRIZWFkZXJzID0gW107XHJcbiAgICAvLyByZW1vdmUgLm1kIGZpbGUgZXh0ZW5zaW9uIGFuZCBjb252ZXJ0IGZpbGVfcGF0aCB0byBicmVhZGNydW1iIGZvcm1hdHRpbmdcclxuICAgIGNvbnN0IGZpbGVfYnJlYWRjcnVtYnMgPSBmaWxlX3BhdGgucmVwbGFjZShcIi5tZFwiLCBcIlwiKS5yZXBsYWNlKC9cXC8vZywgXCIgPiBcIik7XHJcbiAgICAvLyBpbml0aWFsaXplIHRoZSBibG9jayBzdHJpbmdcclxuICAgIGxldCBibG9jayA9IFwiXCI7XHJcbiAgICBsZXQgYmxvY2tfaGVhZGluZ3MgPSBcIlwiO1xyXG4gICAgbGV0IGJsb2NrX3BhdGggPSBmaWxlX3BhdGg7XHJcblxyXG4gICAgbGV0IGxhc3RfaGVhZGluZ19saW5lID0gMDtcclxuICAgIGxldCBpID0gMDtcclxuICAgIGxldCBibG9ja19oZWFkaW5nc19saXN0ID0gW107XHJcbiAgICAvLyBsb29wIHRocm91Z2ggdGhlIGxpbmVzXHJcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgLy8gZ2V0IHRoZSBsaW5lXHJcbiAgICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcclxuICAgICAgLy8gaWYgbGluZSBkb2VzIG5vdCBzdGFydCB3aXRoICNcclxuICAgICAgLy8gb3IgaWYgbGluZSBzdGFydHMgd2l0aCAjIGFuZCBzZWNvbmQgY2hhcmFjdGVyIGlzIGEgd29yZCBvciBudW1iZXIgaW5kaWNhdGluZyBhIFwidGFnXCJcclxuICAgICAgLy8gdGhlbiBhZGQgdG8gYmxvY2tcclxuICAgICAgaWYgKCFsaW5lLnN0YXJ0c1dpdGgoXCIjXCIpIHx8IFtcIiNcIiwgXCIgXCJdLmluZGV4T2YobGluZVsxXSkgPCAwKSB7XHJcbiAgICAgICAgLy8gc2tpcCBpZiBsaW5lIGlzIGVtcHR5XHJcbiAgICAgICAgaWYgKGxpbmUgPT09IFwiXCIpIGNvbnRpbnVlO1xyXG4gICAgICAgIC8vIHNraXAgaWYgbGluZSBpcyBlbXB0eSBidWxsZXQgb3IgY2hlY2tib3hcclxuICAgICAgICBpZiAoW1wiLSBcIiwgXCItIFsgXSBcIl0uaW5kZXhPZihsaW5lKSA+IC0xKSBjb250aW51ZTtcclxuICAgICAgICAvLyBpZiBjdXJyZW50SGVhZGVycyBpcyBlbXB0eSBza2lwIChvbmx5IGJsb2NrcyB3aXRoIGhlYWRlcnMsIG90aGVyd2lzZSBibG9jay5wYXRoIGNvbmZsaWN0cyB3aXRoIGZpbGUucGF0aClcclxuICAgICAgICBpZiAoY3VycmVudEhlYWRlcnMubGVuZ3RoID09PSAwKSBjb250aW51ZTtcclxuICAgICAgICAvLyBhZGQgbGluZSB0byBibG9ja1xyXG4gICAgICAgIGJsb2NrICs9IFwiXFxuXCIgKyBsaW5lO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIC8qKlxyXG4gICAgICAgKiBCRUdJTiBIZWFkaW5nIHBhcnNpbmdcclxuICAgICAgICogLSBsaWtlbHkgYSBoZWFkaW5nIGlmIG1hZGUgaXQgdGhpcyBmYXJcclxuICAgICAgICovXHJcbiAgICAgIGxhc3RfaGVhZGluZ19saW5lID0gaTtcclxuICAgICAgLy8gcHVzaCB0aGUgY3VycmVudCBibG9jayB0byB0aGUgYmxvY2tzIGFycmF5IHVubGVzcyBsYXN0IGxpbmUgd2FzIGEgYWxzbyBhIGhlYWRlclxyXG4gICAgICBpZiAoXHJcbiAgICAgICAgaSA+IDAgJiZcclxuICAgICAgICBsYXN0X2hlYWRpbmdfbGluZSAhPT0gaSAtIDEgJiZcclxuICAgICAgICBibG9jay5pbmRleE9mKFwiXFxuXCIpID4gLTEgJiZcclxuICAgICAgICB0aGlzLnZhbGlkYXRlX2hlYWRpbmdzKGJsb2NrX2hlYWRpbmdzKVxyXG4gICAgICApIHtcclxuICAgICAgICBvdXRwdXRfYmxvY2soKTtcclxuICAgICAgfVxyXG4gICAgICAvLyBnZXQgdGhlIGhlYWRlciBsZXZlbFxyXG4gICAgICBjb25zdCBsZXZlbCA9IGxpbmUuc3BsaXQoXCIjXCIpLmxlbmd0aCAtIDE7XHJcbiAgICAgIC8vIHJlbW92ZSBhbnkgaGVhZGVycyBmcm9tIHRoZSBjdXJyZW50IGhlYWRlcnMgYXJyYXkgdGhhdCBhcmUgaGlnaGVyIHRoYW4gdGhlIGN1cnJlbnQgaGVhZGVyIGxldmVsXHJcbiAgICAgIGN1cnJlbnRIZWFkZXJzID0gY3VycmVudEhlYWRlcnMuZmlsdGVyKChoZWFkZXIpID0+IGhlYWRlci5sZXZlbCA8IGxldmVsKTtcclxuICAgICAgLy8gYWRkIGhlYWRlciBhbmQgbGV2ZWwgdG8gY3VycmVudCBoZWFkZXJzIGFycmF5XHJcbiAgICAgIC8vIHRyaW0gdGhlIGhlYWRlciB0byByZW1vdmUgXCIjXCIgYW5kIGFueSB0cmFpbGluZyBzcGFjZXNcclxuICAgICAgY3VycmVudEhlYWRlcnMucHVzaCh7XHJcbiAgICAgICAgaGVhZGVyOiBsaW5lLnJlcGxhY2UoLyMvZywgXCJcIikudHJpbSgpLFxyXG4gICAgICAgIGxldmVsOiBsZXZlbCxcclxuICAgICAgfSk7XHJcbiAgICAgIC8vIGluaXRpYWxpemUgdGhlIGJsb2NrIGJyZWFkY3J1bWJzIHdpdGggZmlsZS5wYXRoIHRoZSBjdXJyZW50IGhlYWRlcnNcclxuICAgICAgYmxvY2sgPSBmaWxlX2JyZWFkY3J1bWJzO1xyXG4gICAgICBibG9jayArPSBcIjogXCIgKyBjdXJyZW50SGVhZGVycy5tYXAoKGhlYWRlcikgPT4gaGVhZGVyLmhlYWRlcikuam9pbihcIiA+IFwiKTtcclxuICAgICAgYmxvY2tfaGVhZGluZ3MgPVxyXG4gICAgICAgIFwiI1wiICsgY3VycmVudEhlYWRlcnMubWFwKChoZWFkZXIpID0+IGhlYWRlci5oZWFkZXIpLmpvaW4oXCIjXCIpO1xyXG4gICAgICAvLyBpZiBibG9ja19oZWFkaW5ncyBpcyBhbHJlYWR5IGluIGJsb2NrX2hlYWRpbmdzX2xpc3QgdGhlbiBhZGQgYSBudW1iZXIgdG8gdGhlIGVuZFxyXG4gICAgICBpZiAoYmxvY2tfaGVhZGluZ3NfbGlzdC5pbmRleE9mKGJsb2NrX2hlYWRpbmdzKSA+IC0xKSB7XHJcbiAgICAgICAgbGV0IGNvdW50ID0gMTtcclxuICAgICAgICB3aGlsZSAoXHJcbiAgICAgICAgICBibG9ja19oZWFkaW5nc19saXN0LmluZGV4T2YoYCR7YmxvY2tfaGVhZGluZ3N9eyR7Y291bnR9fWApID4gLTFcclxuICAgICAgICApIHtcclxuICAgICAgICAgIGNvdW50Kys7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGJsb2NrX2hlYWRpbmdzID0gYCR7YmxvY2tfaGVhZGluZ3N9eyR7Y291bnR9fWA7XHJcbiAgICAgIH1cclxuICAgICAgYmxvY2tfaGVhZGluZ3NfbGlzdC5wdXNoKGJsb2NrX2hlYWRpbmdzKTtcclxuICAgICAgYmxvY2tfcGF0aCA9IGZpbGVfcGF0aCArIGJsb2NrX2hlYWRpbmdzO1xyXG4gICAgfVxyXG4gICAgLy8gaGFuZGxlIHJlbWFpbmluZyBhZnRlciBsb29wXHJcbiAgICBpZiAoXHJcbiAgICAgIGxhc3RfaGVhZGluZ19saW5lICE9PSBpIC0gMSAmJlxyXG4gICAgICBibG9jay5pbmRleE9mKFwiXFxuXCIpID4gLTEgJiZcclxuICAgICAgdGhpcy52YWxpZGF0ZV9oZWFkaW5ncyhibG9ja19oZWFkaW5ncylcclxuICAgIClcclxuICAgICAgb3V0cHV0X2Jsb2NrKCk7XHJcbiAgICAvLyByZW1vdmUgYW55IGJsb2NrcyB0aGF0IGFyZSB0b28gc2hvcnQgKGxlbmd0aCA8IDUwKVxyXG4gICAgYmxvY2tzID0gYmxvY2tzLmZpbHRlcigoYikgPT4gYi5sZW5ndGggPiA1MCk7XHJcbiAgICAvLyByZXR1cm4gdGhlIGJsb2NrcyBhcnJheVxyXG4gICAgcmV0dXJuIGJsb2NrcztcclxuXHJcbiAgICBmdW5jdGlvbiBvdXRwdXRfYmxvY2soKSB7XHJcbiAgICAgIC8vIGJyZWFkY3J1bWJzIGxlbmd0aCAoZmlyc3QgbGluZSBvZiBibG9jaylcclxuICAgICAgY29uc3QgYnJlYWRjcnVtYnNfbGVuZ3RoID0gYmxvY2suaW5kZXhPZihcIlxcblwiKSArIDE7XHJcbiAgICAgIGNvbnN0IGJsb2NrX2xlbmd0aCA9IGJsb2NrLmxlbmd0aCAtIGJyZWFkY3J1bWJzX2xlbmd0aDtcclxuICAgICAgLy8gdHJpbSBibG9jayB0byBtYXggbGVuZ3RoXHJcbiAgICAgIGlmIChibG9jay5sZW5ndGggPiBNQVhfRU1CRURfU1RSSU5HX0xFTkdUSCkge1xyXG4gICAgICAgIGJsb2NrID0gYmxvY2suc3Vic3RyaW5nKDAsIE1BWF9FTUJFRF9TVFJJTkdfTEVOR1RIKTtcclxuICAgICAgfVxyXG4gICAgICBibG9ja3MucHVzaCh7XHJcbiAgICAgICAgdGV4dDogYmxvY2sudHJpbSgpLFxyXG4gICAgICAgIHBhdGg6IGJsb2NrX3BhdGgsXHJcbiAgICAgICAgbGVuZ3RoOiBibG9ja19sZW5ndGgsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuICAvLyByZXZlcnNlLXJldHJpZXZlIGJsb2NrIGdpdmVuIHBhdGhcclxuICBhc3luYyBibG9ja19yZXRyaWV2ZXIocGF0aCwgbGltaXRzID0ge30pIHtcclxuICAgIGxpbWl0cyA9IHtcclxuICAgICAgbGluZXM6IG51bGwsXHJcbiAgICAgIGNoYXJzX3Blcl9saW5lOiBudWxsLFxyXG4gICAgICBtYXhfY2hhcnM6IG51bGwsXHJcbiAgICAgIC4uLmxpbWl0cyxcclxuICAgIH07XHJcbiAgICAvLyByZXR1cm4gaWYgbm8gIyBpbiBwYXRoXHJcbiAgICBpZiAocGF0aC5pbmRleE9mKFwiI1wiKSA8IDApIHtcclxuICAgICAgY29uc29sZS5sb2coXCJub3QgYSBibG9jayBwYXRoOiBcIiArIHBhdGgpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBsZXQgYmxvY2sgPSBbXTtcclxuICAgIGxldCBibG9ja19oZWFkaW5ncyA9IHBhdGguc3BsaXQoXCIjXCIpLnNsaWNlKDEpO1xyXG4gICAgLy8gaWYgcGF0aCBlbmRzIHdpdGggbnVtYmVyIGluIGN1cmx5IGJyYWNlc1xyXG4gICAgbGV0IGhlYWRpbmdfb2NjdXJyZW5jZSA9IDA7XHJcbiAgICBpZiAoYmxvY2tfaGVhZGluZ3NbYmxvY2tfaGVhZGluZ3MubGVuZ3RoIC0gMV0uaW5kZXhPZihcIntcIikgPiAtMSkge1xyXG4gICAgICAvLyBnZXQgdGhlIG9jY3VycmVuY2UgbnVtYmVyXHJcbiAgICAgIGhlYWRpbmdfb2NjdXJyZW5jZSA9IHBhcnNlSW50KFxyXG4gICAgICAgIGJsb2NrX2hlYWRpbmdzW2Jsb2NrX2hlYWRpbmdzLmxlbmd0aCAtIDFdLnNwbGl0KFwie1wiKVsxXS5yZXBsYWNlKFwifVwiLCBcIlwiKVxyXG4gICAgICApO1xyXG4gICAgICAvLyByZW1vdmUgdGhlIG9jY3VycmVuY2UgZnJvbSB0aGUgbGFzdCBoZWFkaW5nXHJcbiAgICAgIGJsb2NrX2hlYWRpbmdzW2Jsb2NrX2hlYWRpbmdzLmxlbmd0aCAtIDFdID1cclxuICAgICAgICBibG9ja19oZWFkaW5nc1tibG9ja19oZWFkaW5ncy5sZW5ndGggLSAxXS5zcGxpdChcIntcIilbMF07XHJcbiAgICB9XHJcbiAgICBsZXQgY3VycmVudEhlYWRlcnMgPSBbXTtcclxuICAgIGxldCBvY2N1cnJlbmNlX2NvdW50ID0gMDtcclxuICAgIGxldCBiZWdpbl9saW5lID0gMDtcclxuICAgIGxldCBpID0gMDtcclxuICAgIC8vIGdldCBmaWxlIHBhdGggZnJvbSBwYXRoXHJcbiAgICBjb25zdCBmaWxlX3BhdGggPSBwYXRoLnNwbGl0KFwiI1wiKVswXTtcclxuICAgIC8vIGdldCBmaWxlXHJcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVfcGF0aCk7XHJcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgT2JzaWRpYW4uVEZpbGUpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKFwibm90IGEgZmlsZTogXCIgKyBmaWxlX3BhdGgpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICAvLyBnZXQgZmlsZSBjb250ZW50c1xyXG4gICAgY29uc3QgZmlsZV9jb250ZW50cyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XHJcbiAgICAvLyBzcGxpdCB0aGUgZmlsZSBjb250ZW50cyBpbnRvIGxpbmVzXHJcbiAgICBjb25zdCBsaW5lcyA9IGZpbGVfY29udGVudHMuc3BsaXQoXCJcXG5cIik7XHJcbiAgICAvLyBsb29wIHRocm91Z2ggdGhlIGxpbmVzXHJcbiAgICBsZXQgaXNfY29kZSA9IGZhbHNlO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIC8vIGdldCB0aGUgbGluZVxyXG4gICAgICBjb25zdCBsaW5lID0gbGluZXNbaV07XHJcbiAgICAgIC8vIGlmIGxpbmUgYmVnaW5zIHdpdGggdGhyZWUgYmFja3RpY2tzIHRoZW4gdG9nZ2xlIGlzX2NvZGVcclxuICAgICAgaWYgKGxpbmUuaW5kZXhPZihcImBgYFwiKSA9PT0gMCkge1xyXG4gICAgICAgIGlzX2NvZGUgPSAhaXNfY29kZTtcclxuICAgICAgfVxyXG4gICAgICAvLyBpZiBpc19jb2RlIGlzIHRydWUgdGhlbiBhZGQgbGluZSB3aXRoIHByZWNlZGluZyB0YWIgYW5kIGNvbnRpbnVlXHJcbiAgICAgIGlmIChpc19jb2RlKSB7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuICAgICAgLy8gc2tpcCBpZiBsaW5lIGlzIGVtcHR5IGJ1bGxldCBvciBjaGVja2JveFxyXG4gICAgICBpZiAoW1wiLSBcIiwgXCItIFsgXSBcIl0uaW5kZXhPZihsaW5lKSA+IC0xKSBjb250aW51ZTtcclxuICAgICAgLy8gaWYgbGluZSBkb2VzIG5vdCBzdGFydCB3aXRoICNcclxuICAgICAgLy8gb3IgaWYgbGluZSBzdGFydHMgd2l0aCAjIGFuZCBzZWNvbmQgY2hhcmFjdGVyIGlzIGEgd29yZCBvciBudW1iZXIgaW5kaWNhdGluZyBhIFwidGFnXCJcclxuICAgICAgLy8gdGhlbiBjb250aW51ZSB0byBuZXh0IGxpbmVcclxuICAgICAgaWYgKCFsaW5lLnN0YXJ0c1dpdGgoXCIjXCIpIHx8IFtcIiNcIiwgXCIgXCJdLmluZGV4T2YobGluZVsxXSkgPCAwKSB7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuICAgICAgLyoqXHJcbiAgICAgICAqIEJFR0lOIEhlYWRpbmcgcGFyc2luZ1xyXG4gICAgICAgKiAtIGxpa2VseSBhIGhlYWRpbmcgaWYgbWFkZSBpdCB0aGlzIGZhclxyXG4gICAgICAgKi9cclxuICAgICAgLy8gZ2V0IHRoZSBoZWFkaW5nIHRleHRcclxuICAgICAgY29uc3QgaGVhZGluZ190ZXh0ID0gbGluZS5yZXBsYWNlKC8jL2csIFwiXCIpLnRyaW0oKTtcclxuICAgICAgLy8gY29udGludWUgaWYgaGVhZGluZyB0ZXh0IGlzIG5vdCBpbiBibG9ja19oZWFkaW5nc1xyXG4gICAgICBjb25zdCBoZWFkaW5nX2luZGV4ID0gYmxvY2tfaGVhZGluZ3MuaW5kZXhPZihoZWFkaW5nX3RleHQpO1xyXG4gICAgICBpZiAoaGVhZGluZ19pbmRleCA8IDApIGNvbnRpbnVlO1xyXG4gICAgICAvLyBpZiBjdXJyZW50SGVhZGVycy5sZW5ndGggIT09IGhlYWRpbmdfaW5kZXggdGhlbiB3ZSBoYXZlIGEgbWlzbWF0Y2hcclxuICAgICAgaWYgKGN1cnJlbnRIZWFkZXJzLmxlbmd0aCAhPT0gaGVhZGluZ19pbmRleCkgY29udGludWU7XHJcbiAgICAgIC8vIHB1c2ggdGhlIGhlYWRpbmcgdGV4dCB0byB0aGUgY3VycmVudEhlYWRlcnMgYXJyYXlcclxuICAgICAgY3VycmVudEhlYWRlcnMucHVzaChoZWFkaW5nX3RleHQpO1xyXG4gICAgICAvLyBpZiBjdXJyZW50SGVhZGVycy5sZW5ndGggPT09IGJsb2NrX2hlYWRpbmdzLmxlbmd0aCB0aGVuIHdlIGhhdmUgYSBtYXRjaFxyXG4gICAgICBpZiAoY3VycmVudEhlYWRlcnMubGVuZ3RoID09PSBibG9ja19oZWFkaW5ncy5sZW5ndGgpIHtcclxuICAgICAgICAvLyBpZiBoZWFkaW5nX29jY3VycmVuY2UgaXMgZGVmaW5lZCB0aGVuIGluY3JlbWVudCBvY2N1cnJlbmNlX2NvdW50XHJcbiAgICAgICAgaWYgKGhlYWRpbmdfb2NjdXJyZW5jZSA9PT0gMCkge1xyXG4gICAgICAgICAgLy8gc2V0IGJlZ2luX2xpbmUgdG8gaSArIDFcclxuICAgICAgICAgIGJlZ2luX2xpbmUgPSBpICsgMTtcclxuICAgICAgICAgIGJyZWFrOyAvLyBicmVhayBvdXQgb2YgbG9vcFxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBpZiBvY2N1cnJlbmNlX2NvdW50ICE9PSBoZWFkaW5nX29jY3VycmVuY2UgdGhlbiBjb250aW51ZVxyXG4gICAgICAgIGlmIChvY2N1cnJlbmNlX2NvdW50ID09PSBoZWFkaW5nX29jY3VycmVuY2UpIHtcclxuICAgICAgICAgIGJlZ2luX2xpbmUgPSBpICsgMTtcclxuICAgICAgICAgIGJyZWFrOyAvLyBicmVhayBvdXQgb2YgbG9vcFxyXG4gICAgICAgIH1cclxuICAgICAgICBvY2N1cnJlbmNlX2NvdW50Kys7XHJcbiAgICAgICAgLy8gcmVzZXQgY3VycmVudEhlYWRlcnNcclxuICAgICAgICBjdXJyZW50SGVhZGVycy5wb3AoKTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8gaWYgbm8gYmVnaW5fbGluZSB0aGVuIHJldHVybiBmYWxzZVxyXG4gICAgaWYgKGJlZ2luX2xpbmUgPT09IDApIHJldHVybiBmYWxzZTtcclxuICAgIC8vIGl0ZXJhdGUgdGhyb3VnaCBsaW5lcyBzdGFydGluZyBhdCBiZWdpbl9saW5lXHJcbiAgICBpc19jb2RlID0gZmFsc2U7XHJcbiAgICAvLyBjaGFyYWN0ZXIgYWNjdW11bGF0b3JcclxuICAgIGxldCBjaGFyX2NvdW50ID0gMDtcclxuICAgIGZvciAoaSA9IGJlZ2luX2xpbmU7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICBpZiAodHlwZW9mIGxpbmVfbGltaXQgPT09IFwibnVtYmVyXCIgJiYgYmxvY2subGVuZ3RoID4gbGluZV9saW1pdCkge1xyXG4gICAgICAgIGJsb2NrLnB1c2goXCIuLi5cIik7XHJcbiAgICAgICAgYnJlYWs7IC8vIGVuZHMgd2hlbiBsaW5lX2xpbWl0IGlzIHJlYWNoZWRcclxuICAgICAgfVxyXG4gICAgICBsZXQgbGluZSA9IGxpbmVzW2ldO1xyXG4gICAgICBpZiAobGluZS5pbmRleE9mKFwiI1wiKSA9PT0gMCAmJiBbXCIjXCIsIFwiIFwiXS5pbmRleE9mKGxpbmVbMV0pICE9PSAtMSkge1xyXG4gICAgICAgIGJyZWFrOyAvLyBlbmRzIHdoZW4gZW5jb3VudGVyaW5nIG5leHQgaGVhZGVyXHJcbiAgICAgIH1cclxuICAgICAgLy8gREVQUkVDQVRFRDogc2hvdWxkIGJlIGhhbmRsZWQgYnkgbmV3X2xpbmUrY2hhcl9jb3VudCBjaGVjayAoaGFwcGVucyBpbiBwcmV2aW91cyBpdGVyYXRpb24pXHJcbiAgICAgIC8vIGlmIGNoYXJfY291bnQgaXMgZ3JlYXRlciB0aGFuIGxpbWl0Lm1heF9jaGFycywgc2tpcFxyXG4gICAgICBpZiAobGltaXRzLm1heF9jaGFycyAmJiBjaGFyX2NvdW50ID4gbGltaXRzLm1heF9jaGFycykge1xyXG4gICAgICAgIGJsb2NrLnB1c2goXCIuLi5cIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgICAgLy8gaWYgbmV3X2xpbmUgKyBjaGFyX2NvdW50IGlzIGdyZWF0ZXIgdGhhbiBsaW1pdC5tYXhfY2hhcnMsIHNraXBcclxuICAgICAgaWYgKGxpbWl0cy5tYXhfY2hhcnMgJiYgbGluZS5sZW5ndGggKyBjaGFyX2NvdW50ID4gbGltaXRzLm1heF9jaGFycykge1xyXG4gICAgICAgIGNvbnN0IG1heF9uZXdfY2hhcnMgPSBsaW1pdHMubWF4X2NoYXJzIC0gY2hhcl9jb3VudDtcclxuICAgICAgICBsaW5lID0gbGluZS5zbGljZSgwLCBtYXhfbmV3X2NoYXJzKSArIFwiLi4uXCI7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgICAgLy8gdmFsaWRhdGUvZm9ybWF0XHJcbiAgICAgIC8vIGlmIGxpbmUgaXMgZW1wdHksIHNraXBcclxuICAgICAgaWYgKGxpbmUubGVuZ3RoID09PSAwKSBjb250aW51ZTtcclxuICAgICAgLy8gbGltaXQgbGVuZ3RoIG9mIGxpbmUgdG8gTiBjaGFyYWN0ZXJzXHJcbiAgICAgIGlmIChsaW1pdHMuY2hhcnNfcGVyX2xpbmUgJiYgbGluZS5sZW5ndGggPiBsaW1pdHMuY2hhcnNfcGVyX2xpbmUpIHtcclxuICAgICAgICBsaW5lID0gbGluZS5zbGljZSgwLCBsaW1pdHMuY2hhcnNfcGVyX2xpbmUpICsgXCIuLi5cIjtcclxuICAgICAgfVxyXG4gICAgICAvLyBpZiBsaW5lIGlzIGEgY29kZSBibG9jaywgc2tpcFxyXG4gICAgICBpZiAobGluZS5zdGFydHNXaXRoKFwiYGBgXCIpKSB7XHJcbiAgICAgICAgaXNfY29kZSA9ICFpc19jb2RlO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChpc19jb2RlKSB7XHJcbiAgICAgICAgLy8gYWRkIHRhYiB0byBiZWdpbm5pbmcgb2YgbGluZVxyXG4gICAgICAgIGxpbmUgPSBcIlxcdFwiICsgbGluZTtcclxuICAgICAgfVxyXG4gICAgICAvLyBhZGQgbGluZSB0byBibG9ja1xyXG4gICAgICBibG9jay5wdXNoKGxpbmUpO1xyXG4gICAgICAvLyBpbmNyZW1lbnQgY2hhcl9jb3VudFxyXG4gICAgICBjaGFyX2NvdW50ICs9IGxpbmUubGVuZ3RoO1xyXG4gICAgfVxyXG4gICAgLy8gY2xvc2UgY29kZSBibG9jayBpZiBvcGVuXHJcbiAgICBpZiAoaXNfY29kZSkge1xyXG4gICAgICBibG9jay5wdXNoKFwiYGBgXCIpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGJsb2NrLmpvaW4oXCJcXG5cIikudHJpbSgpO1xyXG4gIH1cclxuXHJcbiAgLy8gcmV0cmlldmUgYSBmaWxlIGZyb20gdGhlIHZhdWx0XHJcbiAgYXN5bmMgZmlsZV9yZXRyaWV2ZXIobGluaywgbGltaXRzID0ge30pIHtcclxuICAgIGxpbWl0cyA9IHtcclxuICAgICAgbGluZXM6IG51bGwsXHJcbiAgICAgIG1heF9jaGFyczogbnVsbCxcclxuICAgICAgY2hhcnNfcGVyX2xpbmU6IG51bGwsXHJcbiAgICAgIC4uLmxpbWl0cyxcclxuICAgIH07XHJcbiAgICBjb25zdCB0aGlzX2ZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobGluayk7XHJcbiAgICAvLyBpZiBmaWxlIGlzIG5vdCBmb3VuZCwgc2tpcFxyXG4gICAgaWYgKCEodGhpc19maWxlIGluc3RhbmNlb2YgT2JzaWRpYW4uVEFic3RyYWN0RmlsZSkpIHJldHVybiBmYWxzZTtcclxuICAgIC8vIHVzZSBjYWNoZWRSZWFkIHRvIGdldCB0aGUgZmlyc3QgMTAgbGluZXMgb2YgdGhlIGZpbGVcclxuICAgIGNvbnN0IGZpbGVfY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQodGhpc19maWxlKTtcclxuICAgIGNvbnN0IGZpbGVfbGluZXMgPSBmaWxlX2NvbnRlbnQuc3BsaXQoXCJcXG5cIik7XHJcbiAgICBsZXQgZmlyc3RfdGVuX2xpbmVzID0gW107XHJcbiAgICBsZXQgaXNfY29kZSA9IGZhbHNlO1xyXG4gICAgbGV0IGNoYXJfYWNjdW0gPSAwO1xyXG4gICAgY29uc3QgbGluZV9saW1pdCA9IGxpbWl0cy5saW5lcyB8fCBmaWxlX2xpbmVzLmxlbmd0aDtcclxuICAgIGZvciAobGV0IGkgPSAwOyBmaXJzdF90ZW5fbGluZXMubGVuZ3RoIDwgbGluZV9saW1pdDsgaSsrKSB7XHJcbiAgICAgIGxldCBsaW5lID0gZmlsZV9saW5lc1tpXTtcclxuICAgICAgLy8gaWYgbGluZSBpcyB1bmRlZmluZWQsIGJyZWFrXHJcbiAgICAgIGlmICh0eXBlb2YgbGluZSA9PT0gXCJ1bmRlZmluZWRcIikgYnJlYWs7XHJcbiAgICAgIC8vIGlmIGxpbmUgaXMgZW1wdHksIHNraXBcclxuICAgICAgaWYgKGxpbmUubGVuZ3RoID09PSAwKSBjb250aW51ZTtcclxuICAgICAgLy8gbGltaXQgbGVuZ3RoIG9mIGxpbmUgdG8gTiBjaGFyYWN0ZXJzXHJcbiAgICAgIGlmIChsaW1pdHMuY2hhcnNfcGVyX2xpbmUgJiYgbGluZS5sZW5ndGggPiBsaW1pdHMuY2hhcnNfcGVyX2xpbmUpIHtcclxuICAgICAgICBsaW5lID0gbGluZS5zbGljZSgwLCBsaW1pdHMuY2hhcnNfcGVyX2xpbmUpICsgXCIuLi5cIjtcclxuICAgICAgfVxyXG4gICAgICAvLyBpZiBsaW5lIGlzIFwiLS0tXCIsIHNraXBcclxuICAgICAgaWYgKGxpbmUgPT09IFwiLS0tXCIpIGNvbnRpbnVlO1xyXG4gICAgICAvLyBza2lwIGlmIGxpbmUgaXMgZW1wdHkgYnVsbGV0IG9yIGNoZWNrYm94XHJcbiAgICAgIGlmIChbXCItIFwiLCBcIi0gWyBdIFwiXS5pbmRleE9mKGxpbmUpID4gLTEpIGNvbnRpbnVlO1xyXG4gICAgICAvLyBpZiBsaW5lIGlzIGEgY29kZSBibG9jaywgc2tpcFxyXG4gICAgICBpZiAobGluZS5pbmRleE9mKFwiYGBgXCIpID09PSAwKSB7XHJcbiAgICAgICAgaXNfY29kZSA9ICFpc19jb2RlO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGlmIGNoYXJfYWNjdW0gaXMgZ3JlYXRlciB0aGFuIGxpbWl0Lm1heF9jaGFycywgc2tpcFxyXG4gICAgICBpZiAobGltaXRzLm1heF9jaGFycyAmJiBjaGFyX2FjY3VtID4gbGltaXRzLm1heF9jaGFycykge1xyXG4gICAgICAgIGZpcnN0X3Rlbl9saW5lcy5wdXNoKFwiLi4uXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChpc19jb2RlKSB7XHJcbiAgICAgICAgLy8gaWYgaXMgY29kZSwgYWRkIHRhYiB0byBiZWdpbm5pbmcgb2YgbGluZVxyXG4gICAgICAgIGxpbmUgPSBcIlxcdFwiICsgbGluZTtcclxuICAgICAgfVxyXG4gICAgICAvLyBpZiBsaW5lIGlzIGEgaGVhZGluZ1xyXG4gICAgICBpZiAobGluZV9pc19oZWFkaW5nKGxpbmUpKSB7XHJcbiAgICAgICAgLy8gbG9vayBhdCBsYXN0IGxpbmUgaW4gZmlyc3RfdGVuX2xpbmVzIHRvIHNlZSBpZiBpdCBpcyBhIGhlYWRpbmdcclxuICAgICAgICAvLyBub3RlOiB1c2VzIGxhc3QgaW4gZmlyc3RfdGVuX2xpbmVzLCBpbnN0ZWFkIG9mIGxvb2sgYWhlYWQgaW4gZmlsZV9saW5lcywgYmVjYXVzZS4uXHJcbiAgICAgICAgLy8gLi4ubmV4dCBsaW5lIG1heSBiZSBleGNsdWRlZCBmcm9tIGZpcnN0X3Rlbl9saW5lcyBieSBwcmV2aW91cyBpZiBzdGF0ZW1lbnRzXHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgZmlyc3RfdGVuX2xpbmVzLmxlbmd0aCA+IDAgJiZcclxuICAgICAgICAgIGxpbmVfaXNfaGVhZGluZyhmaXJzdF90ZW5fbGluZXNbZmlyc3RfdGVuX2xpbmVzLmxlbmd0aCAtIDFdKVxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgLy8gaWYgbGFzdCBsaW5lIGlzIGEgaGVhZGluZywgcmVtb3ZlIGl0XHJcbiAgICAgICAgICBmaXJzdF90ZW5fbGluZXMucG9wKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIC8vIGFkZCBsaW5lIHRvIGZpcnN0X3Rlbl9saW5lc1xyXG4gICAgICBmaXJzdF90ZW5fbGluZXMucHVzaChsaW5lKTtcclxuICAgICAgLy8gaW5jcmVtZW50IGNoYXJfYWNjdW1cclxuICAgICAgY2hhcl9hY2N1bSArPSBsaW5lLmxlbmd0aDtcclxuICAgIH1cclxuICAgIC8vIGZvciBlYWNoIGxpbmUgaW4gZmlyc3RfdGVuX2xpbmVzLCBhcHBseSB2aWV3LXNwZWNpZmljIGZvcm1hdHRpbmdcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmlyc3RfdGVuX2xpbmVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIC8vIGlmIGxpbmUgaXMgYSBoZWFkaW5nXHJcbiAgICAgIGlmIChsaW5lX2lzX2hlYWRpbmcoZmlyc3RfdGVuX2xpbmVzW2ldKSkge1xyXG4gICAgICAgIC8vIGlmIHRoaXMgaXMgdGhlIGxhc3QgbGluZSBpbiBmaXJzdF90ZW5fbGluZXNcclxuICAgICAgICBpZiAoaSA9PT0gZmlyc3RfdGVuX2xpbmVzLmxlbmd0aCAtIDEpIHtcclxuICAgICAgICAgIC8vIHJlbW92ZSB0aGUgbGFzdCBsaW5lIGlmIGl0IGlzIGEgaGVhZGluZ1xyXG4gICAgICAgICAgZmlyc3RfdGVuX2xpbmVzLnBvcCgpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIHJlbW92ZSBoZWFkaW5nIHN5bnRheCB0byBpbXByb3ZlIHJlYWRhYmlsaXR5IGluIHNtYWxsIHNwYWNlXHJcbiAgICAgICAgZmlyc3RfdGVuX2xpbmVzW2ldID0gZmlyc3RfdGVuX2xpbmVzW2ldLnJlcGxhY2UoLyMrLywgXCJcIik7XHJcbiAgICAgICAgZmlyc3RfdGVuX2xpbmVzW2ldID0gYFxcbiR7Zmlyc3RfdGVuX2xpbmVzW2ldfTpgO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICAvLyBqb2luIGZpcnN0IHRlbiBsaW5lcyBpbnRvIHN0cmluZ1xyXG4gICAgZmlyc3RfdGVuX2xpbmVzID0gZmlyc3RfdGVuX2xpbmVzLmpvaW4oXCJcXG5cIik7XHJcbiAgICByZXR1cm4gZmlyc3RfdGVuX2xpbmVzO1xyXG4gIH1cclxuXHJcbiAgLy8gaXRlcmF0ZSB0aHJvdWdoIGJsb2NrcyBhbmQgc2tpcCBpZiBibG9ja19oZWFkaW5ncyBjb250YWlucyB0aGlzLmhlYWRlcl9leGNsdXNpb25zXHJcbiAgdmFsaWRhdGVfaGVhZGluZ3MoYmxvY2tfaGVhZGluZ3MpIHtcclxuICAgIGxldCB2YWxpZCA9IHRydWU7XHJcbiAgICBpZiAodGhpcy5oZWFkZXJfZXhjbHVzaW9ucy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGZvciAobGV0IGsgPSAwOyBrIDwgdGhpcy5oZWFkZXJfZXhjbHVzaW9ucy5sZW5ndGg7IGsrKykge1xyXG4gICAgICAgIGlmIChibG9ja19oZWFkaW5ncy5pbmRleE9mKHRoaXMuaGVhZGVyX2V4Y2x1c2lvbnNba10pID4gLTEpIHtcclxuICAgICAgICAgIHZhbGlkID0gZmFsc2U7XHJcbiAgICAgICAgICB0aGlzLmxvZ19leGNsdXNpb24oXCJoZWFkaW5nOiBcIiArIHRoaXMuaGVhZGVyX2V4Y2x1c2lvbnNba10pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdmFsaWQ7XHJcbiAgfVxyXG4gIC8vIHJlbmRlciBcIlNtYXJ0IENvbm5lY3Rpb25zXCIgdGV4dCBmaXhlZCBpbiB0aGUgYm90dG9tIHJpZ2h0IGNvcm5lclxyXG4gIHJlbmRlcl9icmFuZChjb250YWluZXIsIGxvY2F0aW9uID0gXCJkZWZhdWx0XCIpIHtcclxuICAgIC8vIGlmIGxvY2F0aW9uIGlzIGFsbCB0aGVuIGdldCBPYmplY3Qua2V5cyh0aGlzLnNjX2JyYW5kaW5nKSBhbmQgY2FsbCB0aGlzIGZ1bmN0aW9uIGZvciBlYWNoXHJcbiAgICBpZiAoY29udGFpbmVyID09PSBcImFsbFwiKSB7XHJcbiAgICAgIGNvbnN0IGxvY2F0aW9ucyA9IE9iamVjdC5rZXlzKHRoaXMuc2NfYnJhbmRpbmcpO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxvY2F0aW9ucy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHRoaXMucmVuZGVyX2JyYW5kKHRoaXMuc2NfYnJhbmRpbmdbbG9jYXRpb25zW2ldXSwgbG9jYXRpb25zW2ldKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICAvLyBicmFuZCBjb250YWluZXJcclxuICAgIHRoaXMuc2NfYnJhbmRpbmdbbG9jYXRpb25dID0gY29udGFpbmVyO1xyXG4gICAgLy8gaWYgdGhpcy5zY19icmFuZGluZ1tsb2NhdGlvbl0gY29udGFpbnMgY2hpbGQgd2l0aCBjbGFzcyBcInNjLWJyYW5kXCIsIHJlbW92ZSBpdFxyXG4gICAgaWYgKHRoaXMuc2NfYnJhbmRpbmdbbG9jYXRpb25dLnF1ZXJ5U2VsZWN0b3IoXCIuc2MtYnJhbmRcIikpIHtcclxuICAgICAgdGhpcy5zY19icmFuZGluZ1tsb2NhdGlvbl0ucXVlcnlTZWxlY3RvcihcIi5zYy1icmFuZFwiKS5yZW1vdmUoKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGJyYW5kX2NvbnRhaW5lciA9IHRoaXMuc2NfYnJhbmRpbmdbbG9jYXRpb25dLmNyZWF0ZUVsKFwiZGl2XCIsIHtcclxuICAgICAgY2xzOiBcInNjLWJyYW5kXCIsXHJcbiAgICB9KTtcclxuICAgIC8vIGFkZCB0ZXh0XHJcbiAgICAvLyBhZGQgU1ZHIHNpZ25hbCBpY29uIHVzaW5nIGdldEljb25cclxuICAgIE9ic2lkaWFuLnNldEljb24oYnJhbmRfY29udGFpbmVyLCBcInNtYXJ0LWNvbm5lY3Rpb25zXCIpO1xyXG4gICAgY29uc3QgYnJhbmRfcCA9IGJyYW5kX2NvbnRhaW5lci5jcmVhdGVFbChcInBcIik7XHJcbiAgICBsZXQgdGV4dCA9IFwiU21hcnQgQ29ubmVjdGlvbnNcIjtcclxuICAgIGxldCBhdHRyID0ge307XHJcbiAgICAvLyBpZiB1cGRhdGUgYXZhaWxhYmxlLCBjaGFuZ2UgdGV4dCB0byBcIlVwZGF0ZSBBdmFpbGFibGVcIlxyXG4gICAgaWYgKHRoaXMudXBkYXRlX2F2YWlsYWJsZSkge1xyXG4gICAgICB0ZXh0ID0gXCJVcGRhdGUgQXZhaWxhYmxlXCI7XHJcbiAgICAgIGF0dHIgPSB7XHJcbiAgICAgICAgc3R5bGU6IFwiZm9udC13ZWlnaHQ6IDcwMDtcIixcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIGJyYW5kX3AuY3JlYXRlRWwoXCJhXCIsIHtcclxuICAgICAgY2xzOiBcIlwiLFxyXG4gICAgICB0ZXh0OiB0ZXh0LFxyXG4gICAgICBocmVmOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9icmlhbnBldHJvL29ic2lkaWFuLXNtYXJ0LWNvbm5lY3Rpb25zL2Rpc2N1c3Npb25zXCIsXHJcbiAgICAgIHRhcmdldDogXCJfYmxhbmtcIixcclxuICAgICAgYXR0cjogYXR0cixcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLy8gY3JlYXRlIGxpc3Qgb2YgbmVhcmVzdCBub3Rlc1xyXG4gIGFzeW5jIHVwZGF0ZV9yZXN1bHRzKGNvbnRhaW5lciwgbmVhcmVzdCkge1xyXG4gICAgbGV0IGxpc3Q7XHJcbiAgICAvLyBjaGVjayBpZiBsaXN0IGV4aXN0c1xyXG4gICAgaWYgKFxyXG4gICAgICBjb250YWluZXIuY2hpbGRyZW4ubGVuZ3RoID4gMSAmJlxyXG4gICAgICBjb250YWluZXIuY2hpbGRyZW5bMV0uY2xhc3NMaXN0LmNvbnRhaW5zKFwic2MtbGlzdFwiKVxyXG4gICAgKSB7XHJcbiAgICAgIGxpc3QgPSBjb250YWluZXIuY2hpbGRyZW5bMV07XHJcbiAgICB9XHJcbiAgICAvLyBpZiBsaXN0IGV4aXN0cywgZW1wdHkgaXRcclxuICAgIGlmIChsaXN0KSB7XHJcbiAgICAgIGxpc3QuZW1wdHkoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIGNyZWF0ZSBsaXN0IGVsZW1lbnRcclxuICAgICAgbGlzdCA9IGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJzYy1saXN0XCIgfSk7XHJcbiAgICB9XHJcbiAgICBsZXQgc2VhcmNoX3Jlc3VsdF9jbGFzcyA9IFwic2VhcmNoLXJlc3VsdFwiO1xyXG4gICAgLy8gaWYgc2V0dGluZ3MgZXhwYW5kZWRfdmlldyBpcyBmYWxzZSwgYWRkIHNjLWNvbGxhcHNlZCBjbGFzc1xyXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmV4cGFuZGVkX3ZpZXcpIHNlYXJjaF9yZXN1bHRfY2xhc3MgKz0gXCIgc2MtY29sbGFwc2VkXCI7XHJcblxyXG4gICAgLy8gVE9ETzogYWRkIG9wdGlvbiB0byBncm91cCBuZWFyZXN0IGJ5IGZpbGVcclxuICAgIGlmICghdGhpcy5zZXR0aW5ncy5ncm91cF9uZWFyZXN0X2J5X2ZpbGUpIHtcclxuICAgICAgLy8gZm9yIGVhY2ggbmVhcmVzdCBub3RlXHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbmVhcmVzdC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIC8qKlxyXG4gICAgICAgICAqIEJFR0lOIEVYVEVSTkFMIExJTksgTE9HSUNcclxuICAgICAgICAgKiBpZiBsaW5rIGlzIGFuIG9iamVjdCwgaXQgaW5kaWNhdGVzIGV4dGVybmFsIGxpbmtcclxuICAgICAgICAgKi9cclxuICAgICAgICBpZiAodHlwZW9mIG5lYXJlc3RbaV0ubGluayA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICAgICAgY29uc3QgaXRlbSA9IGxpc3QuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwic2VhcmNoLXJlc3VsdFwiIH0pO1xyXG4gICAgICAgICAgY29uc3QgbGluayA9IGl0ZW0uY3JlYXRlRWwoXCJhXCIsIHtcclxuICAgICAgICAgICAgY2xzOiBcInNlYXJjaC1yZXN1bHQtZmlsZS10aXRsZSBpcy1jbGlja2FibGVcIixcclxuICAgICAgICAgICAgaHJlZjogbmVhcmVzdFtpXS5saW5rLnBhdGgsXHJcbiAgICAgICAgICAgIHRpdGxlOiBuZWFyZXN0W2ldLmxpbmsudGl0bGUsXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGxpbmsuaW5uZXJIVE1MID0gdGhpcy5yZW5kZXJfZXh0ZXJuYWxfbGlua19lbG0obmVhcmVzdFtpXS5saW5rKTtcclxuICAgICAgICAgIGl0ZW0uc2V0QXR0cihcImRyYWdnYWJsZVwiLCBcInRydWVcIik7XHJcbiAgICAgICAgICBjb250aW51ZTsgLy8gZW5kcyBoZXJlIGZvciBleHRlcm5hbCBsaW5rc1xyXG4gICAgICAgIH1cclxuICAgICAgICAvKipcclxuICAgICAgICAgKiBCRUdJTiBJTlRFUk5BTCBMSU5LIExPR0lDXHJcbiAgICAgICAgICogaWYgbGluayBpcyBhIHN0cmluZywgaXQgaW5kaWNhdGVzIGludGVybmFsIGxpbmtcclxuICAgICAgICAgKi9cclxuICAgICAgICBsZXQgZmlsZV9saW5rX3RleHQ7XHJcbiAgICAgICAgY29uc3QgZmlsZV9zaW1pbGFyaXR5X3BjdCA9XHJcbiAgICAgICAgICBNYXRoLnJvdW5kKG5lYXJlc3RbaV0uc2ltaWxhcml0eSAqIDEwMCkgKyBcIiVcIjtcclxuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5zaG93X2Z1bGxfcGF0aCkge1xyXG4gICAgICAgICAgY29uc3QgcGNzID0gbmVhcmVzdFtpXS5saW5rLnNwbGl0KFwiL1wiKTtcclxuICAgICAgICAgIGZpbGVfbGlua190ZXh0ID0gcGNzW3Bjcy5sZW5ndGggLSAxXTtcclxuICAgICAgICAgIGNvbnN0IHBhdGggPSBwY3Muc2xpY2UoMCwgcGNzLmxlbmd0aCAtIDEpLmpvaW4oXCIvXCIpO1xyXG4gICAgICAgICAgLy8gZmlsZV9saW5rX3RleHQgPSBgPHNtYWxsPiR7cGF0aH0gfCAke2ZpbGVfc2ltaWxhcml0eV9wY3R9PC9zbWFsbD48YnI+JHtmaWxlX2xpbmtfdGV4dH1gO1xyXG4gICAgICAgICAgZmlsZV9saW5rX3RleHQgPSBgPHNtYWxsPiR7ZmlsZV9zaW1pbGFyaXR5X3BjdH0gfCAke3BhdGh9IHwgJHtmaWxlX2xpbmtfdGV4dH08L3NtYWxsPmA7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGZpbGVfbGlua190ZXh0ID1cclxuICAgICAgICAgICAgXCI8c21hbGw+XCIgK1xyXG4gICAgICAgICAgICBmaWxlX3NpbWlsYXJpdHlfcGN0ICtcclxuICAgICAgICAgICAgXCIgfCBcIiArXHJcbiAgICAgICAgICAgIG5lYXJlc3RbaV0ubGluay5zcGxpdChcIi9cIikucG9wKCkgK1xyXG4gICAgICAgICAgICBcIjwvc21hbGw+XCI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIHNraXAgY29udGVudHMgcmVuZGVyaW5nIGlmIGluY29tcGF0aWJsZSBmaWxlIHR5cGVcclxuICAgICAgICAvLyBleC4gbm90IG1hcmtkb3duIGZpbGUgb3IgY29udGFpbnMgbm8gJy5leGNhbGlkcmF3J1xyXG4gICAgICAgIGlmICghdGhpcy5yZW5kZXJhYmxlX2ZpbGVfdHlwZShuZWFyZXN0W2ldLmxpbmspKSB7XHJcbiAgICAgICAgICBjb25zdCBpdGVtID0gbGlzdC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJzZWFyY2gtcmVzdWx0XCIgfSk7XHJcbiAgICAgICAgICBjb25zdCBsaW5rID0gaXRlbS5jcmVhdGVFbChcImFcIiwge1xyXG4gICAgICAgICAgICBjbHM6IFwic2VhcmNoLXJlc3VsdC1maWxlLXRpdGxlIGlzLWNsaWNrYWJsZVwiLFxyXG4gICAgICAgICAgICBocmVmOiBuZWFyZXN0W2ldLmxpbmssXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGxpbmsuaW5uZXJIVE1MID0gZmlsZV9saW5rX3RleHQ7XHJcbiAgICAgICAgICAvLyBkcmFnIGFuZCBkcm9wXHJcbiAgICAgICAgICBpdGVtLnNldEF0dHIoXCJkcmFnZ2FibGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICAgICAgLy8gYWRkIGxpc3RlbmVycyB0byBsaW5rXHJcbiAgICAgICAgICB0aGlzLmFkZF9saW5rX2xpc3RlbmVycyhsaW5rLCBuZWFyZXN0W2ldLCBpdGVtKTtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gcmVtb3ZlIGZpbGUgZXh0ZW5zaW9uIGlmIC5tZCBhbmQgbWFrZSAjIGludG8gPlxyXG4gICAgICAgIGZpbGVfbGlua190ZXh0ID0gZmlsZV9saW5rX3RleHQucmVwbGFjZShcIi5tZFwiLCBcIlwiKS5yZXBsYWNlKC8jL2csIFwiID4gXCIpO1xyXG4gICAgICAgIC8vIGNyZWF0ZSBpdGVtXHJcbiAgICAgICAgY29uc3QgaXRlbSA9IGxpc3QuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IHNlYXJjaF9yZXN1bHRfY2xhc3MgfSk7XHJcbiAgICAgICAgLy8gY3JlYXRlIHNwYW4gZm9yIHRvZ2dsZVxyXG4gICAgICAgIGNvbnN0IHRvZ2dsZSA9IGl0ZW0uY3JlYXRlRWwoXCJzcGFuXCIsIHsgY2xzOiBcImlzLWNsaWNrYWJsZVwiIH0pO1xyXG4gICAgICAgIC8vIGluc2VydCByaWdodCB0cmlhbmdsZSBzdmcgYXMgdG9nZ2xlXHJcbiAgICAgICAgT2JzaWRpYW4uc2V0SWNvbih0b2dnbGUsIFwicmlnaHQtdHJpYW5nbGVcIik7IC8vIG11c3QgY29tZSBiZWZvcmUgYWRkaW5nIG90aGVyIGVsbXMgdG8gcHJldmVudCBvdmVyd3JpdGVcclxuICAgICAgICBjb25zdCBsaW5rID0gdG9nZ2xlLmNyZWF0ZUVsKFwiYVwiLCB7XHJcbiAgICAgICAgICBjbHM6IFwic2VhcmNoLXJlc3VsdC1maWxlLXRpdGxlXCIsXHJcbiAgICAgICAgICB0aXRsZTogbmVhcmVzdFtpXS5saW5rLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGxpbmsuaW5uZXJIVE1MID0gZmlsZV9saW5rX3RleHQ7XHJcbiAgICAgICAgLy8gYWRkIGxpc3RlbmVycyB0byBsaW5rXHJcbiAgICAgICAgdGhpcy5hZGRfbGlua19saXN0ZW5lcnMobGluaywgbmVhcmVzdFtpXSwgaXRlbSk7XHJcbiAgICAgICAgdG9nZ2xlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgIC8vIGZpbmQgcGFyZW50IGNvbnRhaW5pbmcgc2VhcmNoLXJlc3VsdCBjbGFzc1xyXG4gICAgICAgICAgbGV0IHBhcmVudCA9IGV2ZW50LnRhcmdldC5wYXJlbnRFbGVtZW50O1xyXG4gICAgICAgICAgd2hpbGUgKCFwYXJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKFwic2VhcmNoLXJlc3VsdFwiKSkge1xyXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIC8vIHRvZ2dsZSBzYy1jb2xsYXBzZWQgY2xhc3NcclxuICAgICAgICAgIHBhcmVudC5jbGFzc0xpc3QudG9nZ2xlKFwic2MtY29sbGFwc2VkXCIpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGNvbnRlbnRzID0gaXRlbS5jcmVhdGVFbChcInVsXCIsIHsgY2xzOiBcIlwiIH0pO1xyXG4gICAgICAgIGNvbnN0IGNvbnRlbnRzX2NvbnRhaW5lciA9IGNvbnRlbnRzLmNyZWF0ZUVsKFwibGlcIiwge1xyXG4gICAgICAgICAgY2xzOiBcInNlYXJjaC1yZXN1bHQtZmlsZS10aXRsZSBpcy1jbGlja2FibGVcIixcclxuICAgICAgICAgIHRpdGxlOiBuZWFyZXN0W2ldLmxpbmssXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWYgKG5lYXJlc3RbaV0ubGluay5pbmRleE9mKFwiI1wiKSA+IC0xKSB7XHJcbiAgICAgICAgICAvLyBpcyBibG9ja1xyXG4gICAgICAgICAgT2JzaWRpYW4uTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5ibG9ja19yZXRyaWV2ZXIobmVhcmVzdFtpXS5saW5rLCB7XHJcbiAgICAgICAgICAgICAgbGluZXM6IDEwLFxyXG4gICAgICAgICAgICAgIG1heF9jaGFyczogMTAwMCxcclxuICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgIGNvbnRlbnRzX2NvbnRhaW5lcixcclxuICAgICAgICAgICAgbmVhcmVzdFtpXS5saW5rLFxyXG4gICAgICAgICAgICBuZXcgT2JzaWRpYW4uQ29tcG9uZW50KClcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIGlzIGZpbGVcclxuICAgICAgICAgIGNvbnN0IGZpcnN0X3Rlbl9saW5lcyA9IGF3YWl0IHRoaXMuZmlsZV9yZXRyaWV2ZXIobmVhcmVzdFtpXS5saW5rLCB7XHJcbiAgICAgICAgICAgIGxpbmVzOiAxMCxcclxuICAgICAgICAgICAgbWF4X2NoYXJzOiAxMDAwLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBpZiAoIWZpcnN0X3Rlbl9saW5lcykgY29udGludWU7IC8vIHNraXAgaWYgZmlsZSBpcyBlbXB0eVxyXG4gICAgICAgICAgT2JzaWRpYW4uTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihcclxuICAgICAgICAgICAgZmlyc3RfdGVuX2xpbmVzLFxyXG4gICAgICAgICAgICBjb250ZW50c19jb250YWluZXIsXHJcbiAgICAgICAgICAgIG5lYXJlc3RbaV0ubGluayxcclxuICAgICAgICAgICAgbmV3IE9ic2lkaWFuLkNvbXBvbmVudCgpXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmFkZF9saW5rX2xpc3RlbmVycyhjb250ZW50cywgbmVhcmVzdFtpXSwgaXRlbSk7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5yZW5kZXJfYnJhbmQoY29udGFpbmVyLCBcImJsb2NrXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gZ3JvdXAgbmVhcmVzdCBieSBmaWxlXHJcbiAgICBjb25zdCBuZWFyZXN0X2J5X2ZpbGUgPSB7fTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbmVhcmVzdC5sZW5ndGg7IGkrKykge1xyXG4gICAgICBjb25zdCBjdXJyID0gbmVhcmVzdFtpXTtcclxuICAgICAgY29uc3QgbGluayA9IGN1cnIubGluaztcclxuICAgICAgLy8gc2tpcCBpZiBsaW5rIGlzIGFuIG9iamVjdCAoaW5kaWNhdGVzIGV4dGVybmFsIGxvZ2ljKVxyXG4gICAgICBpZiAodHlwZW9mIGxpbmsgPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICBuZWFyZXN0X2J5X2ZpbGVbbGluay5wYXRoXSA9IFtjdXJyXTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG4gICAgICBpZiAobGluay5pbmRleE9mKFwiI1wiKSA+IC0xKSB7XHJcbiAgICAgICAgY29uc3QgZmlsZV9wYXRoID0gbGluay5zcGxpdChcIiNcIilbMF07XHJcbiAgICAgICAgaWYgKCFuZWFyZXN0X2J5X2ZpbGVbZmlsZV9wYXRoXSkge1xyXG4gICAgICAgICAgbmVhcmVzdF9ieV9maWxlW2ZpbGVfcGF0aF0gPSBbXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbmVhcmVzdF9ieV9maWxlW2ZpbGVfcGF0aF0ucHVzaChuZWFyZXN0W2ldKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBpZiAoIW5lYXJlc3RfYnlfZmlsZVtsaW5rXSkge1xyXG4gICAgICAgICAgbmVhcmVzdF9ieV9maWxlW2xpbmtdID0gW107XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGFsd2F5cyBhZGQgdG8gZnJvbnQgb2YgYXJyYXlcclxuICAgICAgICBuZWFyZXN0X2J5X2ZpbGVbbGlua10udW5zaGlmdChuZWFyZXN0W2ldKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8gZm9yIGVhY2ggZmlsZVxyXG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG5lYXJlc3RfYnlfZmlsZSk7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgY29uc3QgZmlsZSA9IG5lYXJlc3RfYnlfZmlsZVtrZXlzW2ldXTtcclxuICAgICAgLyoqXHJcbiAgICAgICAqIEJlZ2luIGV4dGVybmFsIGxpbmsgaGFuZGxpbmdcclxuICAgICAgICovXHJcbiAgICAgIC8vIGlmIGxpbmsgaXMgYW4gb2JqZWN0IChpbmRpY2F0ZXMgdjIgbG9naWMpXHJcbiAgICAgIGlmICh0eXBlb2YgZmlsZVswXS5saW5rID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgY29uc3QgY3VyciA9IGZpbGVbMF07XHJcbiAgICAgICAgY29uc3QgbWV0YSA9IGN1cnIubGluaztcclxuICAgICAgICBpZiAobWV0YS5wYXRoLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XHJcbiAgICAgICAgICBjb25zdCBpdGVtID0gbGlzdC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJzZWFyY2gtcmVzdWx0XCIgfSk7XHJcbiAgICAgICAgICBjb25zdCBsaW5rID0gaXRlbS5jcmVhdGVFbChcImFcIiwge1xyXG4gICAgICAgICAgICBjbHM6IFwic2VhcmNoLXJlc3VsdC1maWxlLXRpdGxlIGlzLWNsaWNrYWJsZVwiLFxyXG4gICAgICAgICAgICBocmVmOiBtZXRhLnBhdGgsXHJcbiAgICAgICAgICAgIHRpdGxlOiBtZXRhLnRpdGxlLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBsaW5rLmlubmVySFRNTCA9IHRoaXMucmVuZGVyX2V4dGVybmFsX2xpbmtfZWxtKG1ldGEpO1xyXG4gICAgICAgICAgaXRlbS5zZXRBdHRyKFwiZHJhZ2dhYmxlXCIsIFwidHJ1ZVwiKTtcclxuICAgICAgICAgIGNvbnRpbnVlOyAvLyBlbmRzIGhlcmUgZm9yIGV4dGVybmFsIGxpbmtzXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIC8qKlxyXG4gICAgICAgKiBIYW5kbGVzIEludGVybmFsXHJcbiAgICAgICAqL1xyXG4gICAgICBsZXQgZmlsZV9saW5rX3RleHQ7XHJcbiAgICAgIGNvbnN0IGZpbGVfc2ltaWxhcml0eV9wY3QgPSBNYXRoLnJvdW5kKGZpbGVbMF0uc2ltaWxhcml0eSAqIDEwMCkgKyBcIiVcIjtcclxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Muc2hvd19mdWxsX3BhdGgpIHtcclxuICAgICAgICBjb25zdCBwY3MgPSBmaWxlWzBdLmxpbmsuc3BsaXQoXCIvXCIpO1xyXG4gICAgICAgIGZpbGVfbGlua190ZXh0ID0gcGNzW3Bjcy5sZW5ndGggLSAxXTtcclxuICAgICAgICBjb25zdCBwYXRoID0gcGNzLnNsaWNlKDAsIHBjcy5sZW5ndGggLSAxKS5qb2luKFwiL1wiKTtcclxuICAgICAgICBmaWxlX2xpbmtfdGV4dCA9IGA8c21hbGw+JHtwYXRofSB8ICR7ZmlsZV9zaW1pbGFyaXR5X3BjdH08L3NtYWxsPjxicj4ke2ZpbGVfbGlua190ZXh0fWA7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZmlsZV9saW5rX3RleHQgPSBmaWxlWzBdLmxpbmsuc3BsaXQoXCIvXCIpLnBvcCgpO1xyXG4gICAgICAgIC8vIGFkZCBzaW1pbGFyaXR5IHBlcmNlbnRhZ2VcclxuICAgICAgICBmaWxlX2xpbmtfdGV4dCArPSBcIiB8IFwiICsgZmlsZV9zaW1pbGFyaXR5X3BjdDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gc2tpcCBjb250ZW50cyByZW5kZXJpbmcgaWYgaW5jb21wYXRpYmxlIGZpbGUgdHlwZVxyXG4gICAgICAvLyBleC4gbm90IG1hcmtkb3duIG9yIGNvbnRhaW5zICcuZXhjYWxpZHJhdydcclxuICAgICAgaWYgKCF0aGlzLnJlbmRlcmFibGVfZmlsZV90eXBlKGZpbGVbMF0ubGluaykpIHtcclxuICAgICAgICBjb25zdCBpdGVtID0gbGlzdC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJzZWFyY2gtcmVzdWx0XCIgfSk7XHJcbiAgICAgICAgY29uc3QgZmlsZV9saW5rID0gaXRlbS5jcmVhdGVFbChcImFcIiwge1xyXG4gICAgICAgICAgY2xzOiBcInNlYXJjaC1yZXN1bHQtZmlsZS10aXRsZSBpcy1jbGlja2FibGVcIixcclxuICAgICAgICAgIHRpdGxlOiBmaWxlWzBdLmxpbmssXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZmlsZV9saW5rLmlubmVySFRNTCA9IGZpbGVfbGlua190ZXh0O1xyXG4gICAgICAgIC8vIGFkZCBsaW5rIGxpc3RlbmVycyB0byBmaWxlIGxpbmtcclxuICAgICAgICB0aGlzLmFkZF9saW5rX2xpc3RlbmVycyhmaWxlX2xpbmssIGZpbGVbMF0sIGl0ZW0pO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyByZW1vdmUgZmlsZSBleHRlbnNpb24gaWYgLm1kXHJcbiAgICAgIGZpbGVfbGlua190ZXh0ID0gZmlsZV9saW5rX3RleHQucmVwbGFjZShcIi5tZFwiLCBcIlwiKS5yZXBsYWNlKC8jL2csIFwiID4gXCIpO1xyXG4gICAgICBjb25zdCBpdGVtID0gbGlzdC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogc2VhcmNoX3Jlc3VsdF9jbGFzcyB9KTtcclxuICAgICAgY29uc3QgdG9nZ2xlID0gaXRlbS5jcmVhdGVFbChcInNwYW5cIiwgeyBjbHM6IFwiaXMtY2xpY2thYmxlXCIgfSk7XHJcbiAgICAgIC8vIGluc2VydCByaWdodCB0cmlhbmdsZSBzdmcgaWNvbiBhcyB0b2dnbGUgYnV0dG9uIGluIHNwYW5cclxuICAgICAgT2JzaWRpYW4uc2V0SWNvbih0b2dnbGUsIFwicmlnaHQtdHJpYW5nbGVcIik7IC8vIG11c3QgY29tZSBiZWZvcmUgYWRkaW5nIG90aGVyIGVsbXMgZWxzZSBvdmVyd3JpdGVzXHJcbiAgICAgIGNvbnN0IGZpbGVfbGluayA9IHRvZ2dsZS5jcmVhdGVFbChcImFcIiwge1xyXG4gICAgICAgIGNsczogXCJzZWFyY2gtcmVzdWx0LWZpbGUtdGl0bGVcIixcclxuICAgICAgICB0aXRsZTogZmlsZVswXS5saW5rLFxyXG4gICAgICB9KTtcclxuICAgICAgZmlsZV9saW5rLmlubmVySFRNTCA9IGZpbGVfbGlua190ZXh0O1xyXG4gICAgICAvLyBhZGQgbGluayBsaXN0ZW5lcnMgdG8gZmlsZSBsaW5rXHJcbiAgICAgIHRoaXMuYWRkX2xpbmtfbGlzdGVuZXJzKGZpbGVfbGluaywgZmlsZVswXSwgdG9nZ2xlKTtcclxuICAgICAgdG9nZ2xlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAvLyBmaW5kIHBhcmVudCBjb250YWluaW5nIGNsYXNzIHNlYXJjaC1yZXN1bHRcclxuICAgICAgICBsZXQgcGFyZW50ID0gZXZlbnQudGFyZ2V0O1xyXG4gICAgICAgIHdoaWxlICghcGFyZW50LmNsYXNzTGlzdC5jb250YWlucyhcInNlYXJjaC1yZXN1bHRcIikpIHtcclxuICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgICAgIH1cclxuICAgICAgICBwYXJlbnQuY2xhc3NMaXN0LnRvZ2dsZShcInNjLWNvbGxhcHNlZFwiKTtcclxuICAgICAgICAvLyBUT0RPOiBpZiBibG9jayBjb250YWluZXIgaXMgZW1wdHksIHJlbmRlciBtYXJrZG93biBmcm9tIGJsb2NrIHJldHJpZXZlclxyXG4gICAgICB9KTtcclxuICAgICAgY29uc3QgZmlsZV9saW5rX2xpc3QgPSBpdGVtLmNyZWF0ZUVsKFwidWxcIik7XHJcbiAgICAgIC8vIGZvciBlYWNoIGxpbmsgaW4gZmlsZVxyXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGZpbGUubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAvLyBpZiBpcyBhIGJsb2NrIChoYXMgIyBpbiBsaW5rKVxyXG4gICAgICAgIGlmIChmaWxlW2pdLmxpbmsuaW5kZXhPZihcIiNcIikgPiAtMSkge1xyXG4gICAgICAgICAgY29uc3QgYmxvY2sgPSBmaWxlW2pdO1xyXG4gICAgICAgICAgY29uc3QgYmxvY2tfbGluayA9IGZpbGVfbGlua19saXN0LmNyZWF0ZUVsKFwibGlcIiwge1xyXG4gICAgICAgICAgICBjbHM6IFwic2VhcmNoLXJlc3VsdC1maWxlLXRpdGxlIGlzLWNsaWNrYWJsZVwiLFxyXG4gICAgICAgICAgICB0aXRsZTogYmxvY2subGluayxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgLy8gc2tpcCBibG9jayBjb250ZXh0IGlmIGZpbGUubGVuZ3RoID09PSAxIGJlY2F1c2UgYWxyZWFkeSBhZGRlZFxyXG4gICAgICAgICAgaWYgKGZpbGUubGVuZ3RoID4gMSkge1xyXG4gICAgICAgICAgICBjb25zdCBibG9ja19jb250ZXh0ID0gdGhpcy5yZW5kZXJfYmxvY2tfY29udGV4dChibG9jayk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJsb2NrX3NpbWlsYXJpdHlfcGN0ID1cclxuICAgICAgICAgICAgICBNYXRoLnJvdW5kKGJsb2NrLnNpbWlsYXJpdHkgKiAxMDApICsgXCIlXCI7XHJcbiAgICAgICAgICAgIGJsb2NrX2xpbmsuaW5uZXJIVE1MID0gYDxzbWFsbD4ke2Jsb2NrX2NvbnRleHR9IHwgJHtibG9ja19zaW1pbGFyaXR5X3BjdH08L3NtYWxsPmA7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBjb25zdCBibG9ja19jb250YWluZXIgPSBibG9ja19saW5rLmNyZWF0ZUVsKFwiZGl2XCIpO1xyXG4gICAgICAgICAgLy8gVE9ETzogbW92ZSB0byByZW5kZXJpbmcgb24gZXhwYW5kaW5nIHNlY3Rpb24gKHRvZ2dsZSBjb2xsYXBzZWQpXHJcbiAgICAgICAgICBPYnNpZGlhbi5NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKFxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmJsb2NrX3JldHJpZXZlcihibG9jay5saW5rLCB7XHJcbiAgICAgICAgICAgICAgbGluZXM6IDEwLFxyXG4gICAgICAgICAgICAgIG1heF9jaGFyczogMTAwMCxcclxuICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgIGJsb2NrX2NvbnRhaW5lcixcclxuICAgICAgICAgICAgYmxvY2subGluayxcclxuICAgICAgICAgICAgbmV3IE9ic2lkaWFuLkNvbXBvbmVudCgpXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgLy8gYWRkIGxpbmsgbGlzdGVuZXJzIHRvIGJsb2NrIGxpbmtcclxuICAgICAgICAgIHRoaXMuYWRkX2xpbmtfbGlzdGVuZXJzKGJsb2NrX2xpbmssIGJsb2NrLCBmaWxlX2xpbmtfbGlzdCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIGdldCBmaXJzdCB0ZW4gbGluZXMgb2YgZmlsZVxyXG4gICAgICAgICAgY29uc3QgZmlsZV9saW5rX2xpc3QgPSBpdGVtLmNyZWF0ZUVsKFwidWxcIik7XHJcbiAgICAgICAgICBjb25zdCBibG9ja19saW5rID0gZmlsZV9saW5rX2xpc3QuY3JlYXRlRWwoXCJsaVwiLCB7XHJcbiAgICAgICAgICAgIGNsczogXCJzZWFyY2gtcmVzdWx0LWZpbGUtdGl0bGUgaXMtY2xpY2thYmxlXCIsXHJcbiAgICAgICAgICAgIHRpdGxlOiBmaWxlWzBdLmxpbmssXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGNvbnN0IGJsb2NrX2NvbnRhaW5lciA9IGJsb2NrX2xpbmsuY3JlYXRlRWwoXCJkaXZcIik7XHJcbiAgICAgICAgICBsZXQgZmlyc3RfdGVuX2xpbmVzID0gYXdhaXQgdGhpcy5maWxlX3JldHJpZXZlcihmaWxlWzBdLmxpbmssIHtcclxuICAgICAgICAgICAgbGluZXM6IDEwLFxyXG4gICAgICAgICAgICBtYXhfY2hhcnM6IDEwMDAsXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGlmICghZmlyc3RfdGVuX2xpbmVzKSBjb250aW51ZTsgLy8gaWYgZmlsZSBub3QgZm91bmQsIHNraXBcclxuICAgICAgICAgIE9ic2lkaWFuLk1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oXHJcbiAgICAgICAgICAgIGZpcnN0X3Rlbl9saW5lcyxcclxuICAgICAgICAgICAgYmxvY2tfY29udGFpbmVyLFxyXG4gICAgICAgICAgICBmaWxlWzBdLmxpbmssXHJcbiAgICAgICAgICAgIG5ldyBPYnNpZGlhbi5Db21wb25lbnQoKVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIHRoaXMuYWRkX2xpbmtfbGlzdGVuZXJzKGJsb2NrX2xpbmssIGZpbGVbMF0sIGZpbGVfbGlua19saXN0KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHRoaXMucmVuZGVyX2JyYW5kKGNvbnRhaW5lciwgXCJmaWxlXCIpO1xyXG4gIH1cclxuXHJcbiAgYWRkX2xpbmtfbGlzdGVuZXJzKGl0ZW0sIGN1cnIsIGxpc3QpIHtcclxuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jIChldmVudCkgPT4ge1xyXG4gICAgICBhd2FpdCB0aGlzLm9wZW5fbm90ZShjdXJyLCBldmVudCk7XHJcbiAgICB9KTtcclxuICAgIC8vIGRyYWctb25cclxuICAgIC8vIGN1cnJlbnRseSBvbmx5IHdvcmtzIHdpdGggZnVsbC1maWxlIGxpbmtzXHJcbiAgICBpdGVtLnNldEF0dHIoXCJkcmFnZ2FibGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKFwiZHJhZ3N0YXJ0XCIsIChldmVudCkgPT4ge1xyXG4gICAgICBjb25zdCBkcmFnTWFuYWdlciA9IHRoaXMuYXBwLmRyYWdNYW5hZ2VyO1xyXG4gICAgICBjb25zdCBmaWxlX3BhdGggPSBjdXJyLmxpbmsuc3BsaXQoXCIjXCIpWzBdO1xyXG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaXJzdExpbmtwYXRoRGVzdChmaWxlX3BhdGgsIFwiXCIpO1xyXG4gICAgICBjb25zdCBkcmFnRGF0YSA9IGRyYWdNYW5hZ2VyLmRyYWdGaWxlKGV2ZW50LCBmaWxlKTtcclxuICAgICAgZHJhZ01hbmFnZXIub25EcmFnU3RhcnQoZXZlbnQsIGRyYWdEYXRhKTtcclxuICAgIH0pO1xyXG4gICAgLy8gaWYgY3Vyci5saW5rIGNvbnRhaW5zIGN1cmx5IGJyYWNlcywgcmV0dXJuIChpbmNvbXBhdGlibGUgd2l0aCBob3Zlci1saW5rKVxyXG4gICAgaWYgKGN1cnIubGluay5pbmRleE9mKFwie1wiKSA+IC0xKSByZXR1cm47XHJcbiAgICAvLyB0cmlnZ2VyIGhvdmVyIGV2ZW50IG9uIGxpbmtcclxuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3ZlclwiLCAoZXZlbnQpID0+IHtcclxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLnRyaWdnZXIoXCJob3Zlci1saW5rXCIsIHtcclxuICAgICAgICBldmVudCxcclxuICAgICAgICBzb3VyY2U6IFNNQVJUX0NPTk5FQ1RJT05TX1ZJRVdfVFlQRSxcclxuICAgICAgICBob3ZlclBhcmVudDogbGlzdCxcclxuICAgICAgICB0YXJnZXRFbDogaXRlbSxcclxuICAgICAgICBsaW5rdGV4dDogY3Vyci5saW5rLFxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLy8gZ2V0IHRhcmdldCBmaWxlIGZyb20gbGluayBwYXRoXHJcbiAgLy8gaWYgc3ViLXNlY3Rpb24gaXMgbGlua2VkLCBvcGVuIGZpbGUgYW5kIHNjcm9sbCB0byBzdWItc2VjdGlvblxyXG4gIGFzeW5jIG9wZW5fbm90ZShjdXJyLCBldmVudCA9IG51bGwpIHtcclxuICAgIGxldCB0YXJnZXRGaWxlO1xyXG4gICAgbGV0IGhlYWRpbmc7XHJcbiAgICBpZiAoY3Vyci5saW5rLmluZGV4T2YoXCIjXCIpID4gLTEpIHtcclxuICAgICAgLy8gcmVtb3ZlIGFmdGVyICMgZnJvbSBsaW5rXHJcbiAgICAgIHRhcmdldEZpbGUgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KFxyXG4gICAgICAgIGN1cnIubGluay5zcGxpdChcIiNcIilbMF0sXHJcbiAgICAgICAgXCJcIlxyXG4gICAgICApO1xyXG4gICAgICBjb25zdCB0YXJnZXRfZmlsZV9jYWNoZSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKHRhcmdldEZpbGUpO1xyXG4gICAgICAvLyBnZXQgaGVhZGluZ1xyXG4gICAgICBsZXQgaGVhZGluZ190ZXh0ID0gY3Vyci5saW5rLnNwbGl0KFwiI1wiKS5wb3AoKTtcclxuICAgICAgLy8gaWYgaGVhZGluZyB0ZXh0IGNvbnRhaW5zIGEgY3VybHkgYnJhY2UsIGdldCB0aGUgbnVtYmVyIGluc2lkZSB0aGUgY3VybHkgYnJhY2VzIGFzIG9jY3VyZW5jZVxyXG4gICAgICBsZXQgb2NjdXJlbmNlID0gMDtcclxuICAgICAgaWYgKGhlYWRpbmdfdGV4dC5pbmRleE9mKFwie1wiKSA+IC0xKSB7XHJcbiAgICAgICAgLy8gZ2V0IG9jY3VyZW5jZVxyXG4gICAgICAgIG9jY3VyZW5jZSA9IHBhcnNlSW50KGhlYWRpbmdfdGV4dC5zcGxpdChcIntcIilbMV0uc3BsaXQoXCJ9XCIpWzBdKTtcclxuICAgICAgICAvLyByZW1vdmUgb2NjdXJlbmNlIGZyb20gaGVhZGluZyB0ZXh0XHJcbiAgICAgICAgaGVhZGluZ190ZXh0ID0gaGVhZGluZ190ZXh0LnNwbGl0KFwie1wiKVswXTtcclxuICAgICAgfVxyXG4gICAgICAvLyBnZXQgaGVhZGluZ3MgZnJvbSBmaWxlIGNhY2hlXHJcbiAgICAgIGNvbnN0IGhlYWRpbmdzID0gdGFyZ2V0X2ZpbGVfY2FjaGUuaGVhZGluZ3M7XHJcbiAgICAgIC8vIGdldCBoZWFkaW5ncyB3aXRoIHRoZSBzYW1lIGRlcHRoIGFuZCB0ZXh0IGFzIHRoZSBsaW5rXHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaGVhZGluZ3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAoaGVhZGluZ3NbaV0uaGVhZGluZyA9PT0gaGVhZGluZ190ZXh0KSB7XHJcbiAgICAgICAgICAvLyBpZiBvY2N1cmVuY2UgaXMgMCwgc2V0IGhlYWRpbmcgYW5kIGJyZWFrXHJcbiAgICAgICAgICBpZiAob2NjdXJlbmNlID09PSAwKSB7XHJcbiAgICAgICAgICAgIGhlYWRpbmcgPSBoZWFkaW5nc1tpXTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBvY2N1cmVuY2UtLTsgLy8gZGVjcmVtZW50IG9jY3VyZW5jZVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGFyZ2V0RmlsZSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Rmlyc3RMaW5rcGF0aERlc3QoY3Vyci5saW5rLCBcIlwiKTtcclxuICAgIH1cclxuICAgIGxldCBsZWFmO1xyXG4gICAgaWYgKGV2ZW50KSB7XHJcbiAgICAgIC8vIHByb3Blcmx5IGhhbmRsZSBpZiB0aGUgbWV0YS9jdHJsIGtleSBpcyBwcmVzc2VkXHJcbiAgICAgIGNvbnN0IG1vZCA9IE9ic2lkaWFuLktleW1hcC5pc01vZEV2ZW50KGV2ZW50KTtcclxuICAgICAgLy8gZ2V0IG1vc3QgcmVjZW50IGxlYWZcclxuICAgICAgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWFmKG1vZCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBnZXQgbW9zdCByZWNlbnQgbGVhZlxyXG4gICAgICBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldE1vc3RSZWNlbnRMZWFmKCk7XHJcbiAgICB9XHJcbiAgICBhd2FpdCBsZWFmLm9wZW5GaWxlKHRhcmdldEZpbGUpO1xyXG4gICAgaWYgKGhlYWRpbmcpIHtcclxuICAgICAgbGV0IHsgZWRpdG9yIH0gPSBsZWFmLnZpZXc7XHJcbiAgICAgIGNvbnN0IHBvcyA9IHsgbGluZTogaGVhZGluZy5wb3NpdGlvbi5zdGFydC5saW5lLCBjaDogMCB9O1xyXG4gICAgICBlZGl0b3Iuc2V0Q3Vyc29yKHBvcyk7XHJcbiAgICAgIGVkaXRvci5zY3JvbGxJbnRvVmlldyh7IHRvOiBwb3MsIGZyb206IHBvcyB9LCB0cnVlKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJlbmRlcl9ibG9ja19jb250ZXh0KGJsb2NrKSB7XHJcbiAgICBjb25zdCBibG9ja19oZWFkaW5ncyA9IGJsb2NrLmxpbmsuc3BsaXQoXCIubWRcIilbMV0uc3BsaXQoXCIjXCIpO1xyXG4gICAgLy8gc3RhcnRpbmcgd2l0aCB0aGUgbGFzdCBoZWFkaW5nIGZpcnN0LCBpdGVyYXRlIHRocm91Z2ggaGVhZGluZ3NcclxuICAgIGxldCBibG9ja19jb250ZXh0ID0gXCJcIjtcclxuICAgIGZvciAobGV0IGkgPSBibG9ja19oZWFkaW5ncy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICBpZiAoYmxvY2tfY29udGV4dC5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgYmxvY2tfY29udGV4dCA9IGAgPiAke2Jsb2NrX2NvbnRleHR9YDtcclxuICAgICAgfVxyXG4gICAgICBibG9ja19jb250ZXh0ID0gYmxvY2tfaGVhZGluZ3NbaV0gKyBibG9ja19jb250ZXh0O1xyXG4gICAgICAvLyBpZiBibG9jayBjb250ZXh0IGlzIGxvbmdlciB0aGFuIE4gY2hhcmFjdGVycywgYnJlYWtcclxuICAgICAgaWYgKGJsb2NrX2NvbnRleHQubGVuZ3RoID4gMTAwKSB7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIHJlbW92ZSBsZWFkaW5nID4gaWYgZXhpc3RzXHJcbiAgICBpZiAoYmxvY2tfY29udGV4dC5zdGFydHNXaXRoKFwiID4gXCIpKSB7XHJcbiAgICAgIGJsb2NrX2NvbnRleHQgPSBibG9ja19jb250ZXh0LnNsaWNlKDMpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGJsb2NrX2NvbnRleHQ7XHJcbiAgfVxyXG5cclxuICByZW5kZXJhYmxlX2ZpbGVfdHlwZShsaW5rKSB7XHJcbiAgICByZXR1cm4gbGluay5pbmRleE9mKFwiLm1kXCIpICE9PSAtMSAmJiBsaW5rLmluZGV4T2YoXCIuZXhjYWxpZHJhd1wiKSA9PT0gLTE7XHJcbiAgfVxyXG5cclxuICByZW5kZXJfZXh0ZXJuYWxfbGlua19lbG0obWV0YSkge1xyXG4gICAgaWYgKG1ldGEuc291cmNlKSB7XHJcbiAgICAgIGlmIChtZXRhLnNvdXJjZSA9PT0gXCJHbWFpbFwiKSBtZXRhLnNvdXJjZSA9IFwiXHVEODNEXHVEQ0U3IEdtYWlsXCI7XHJcbiAgICAgIHJldHVybiBgPHNtYWxsPiR7bWV0YS5zb3VyY2V9PC9zbWFsbD48YnI+JHttZXRhLnRpdGxlfWA7XHJcbiAgICB9XHJcbiAgICAvLyByZW1vdmUgaHR0cChzKTovL1xyXG4gICAgbGV0IGRvbWFpbiA9IG1ldGEucGF0aC5yZXBsYWNlKC8oXlxcdys6fF4pXFwvXFwvLywgXCJcIik7XHJcbiAgICAvLyBzZXBhcmF0ZSBkb21haW4gZnJvbSBwYXRoXHJcbiAgICBkb21haW4gPSBkb21haW4uc3BsaXQoXCIvXCIpWzBdO1xyXG4gICAgLy8gd3JhcCBkb21haW4gaW4gPHNtYWxsPiBhbmQgYWRkIGxpbmUgYnJlYWtcclxuICAgIHJldHVybiBgPHNtYWxsPlx1RDgzQ1x1REYxMCAke2RvbWFpbn08L3NtYWxsPjxicj4ke21ldGEudGl0bGV9YDtcclxuICB9XHJcbiAgLy8gZ2V0IGFsbCBmb2xkZXJzXHJcbiAgYXN5bmMgZ2V0X2FsbF9mb2xkZXJzKCkge1xyXG4gICAgaWYgKCF0aGlzLmZvbGRlcnMgfHwgdGhpcy5mb2xkZXJzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aGlzLmZvbGRlcnMgPSBhd2FpdCB0aGlzLmdldF9mb2xkZXJzKCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5mb2xkZXJzO1xyXG4gIH1cclxuICAvLyBnZXQgZm9sZGVycywgdHJhdmVyc2Ugbm9uLWhpZGRlbiBzdWItZm9sZGVyc1xyXG4gIGFzeW5jIGdldF9mb2xkZXJzKHBhdGggPSBcIi9cIikge1xyXG4gICAgbGV0IGZvbGRlcnMgPSAoYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5saXN0KHBhdGgpKS5mb2xkZXJzO1xyXG4gICAgbGV0IGZvbGRlcl9saXN0ID0gW107XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZvbGRlcnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgaWYgKGZvbGRlcnNbaV0uc3RhcnRzV2l0aChcIi5cIikpIGNvbnRpbnVlO1xyXG4gICAgICBmb2xkZXJfbGlzdC5wdXNoKGZvbGRlcnNbaV0pO1xyXG4gICAgICBmb2xkZXJfbGlzdCA9IGZvbGRlcl9saXN0LmNvbmNhdChcclxuICAgICAgICBhd2FpdCB0aGlzLmdldF9mb2xkZXJzKGZvbGRlcnNbaV0gKyBcIi9cIilcclxuICAgICAgKTtcclxuICAgIH1cclxuICAgIHJldHVybiBmb2xkZXJfbGlzdDtcclxuICB9XHJcblxyXG4gIGFzeW5jIGJ1aWxkX25vdGVzX29iamVjdChmaWxlcykge1xyXG4gICAgbGV0IG91dHB1dCA9IHt9O1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgbGV0IGZpbGUgPSBmaWxlc1tpXTtcclxuICAgICAgbGV0IHBhcnRzID0gZmlsZS5wYXRoLnNwbGl0KFwiL1wiKTtcclxuICAgICAgbGV0IGN1cnJlbnQgPSBvdXRwdXQ7XHJcblxyXG4gICAgICBmb3IgKGxldCBpaSA9IDA7IGlpIDwgcGFydHMubGVuZ3RoOyBpaSsrKSB7XHJcbiAgICAgICAgbGV0IHBhcnQgPSBwYXJ0c1tpaV07XHJcblxyXG4gICAgICAgIGlmIChpaSA9PT0gcGFydHMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgLy8gVGhpcyBpcyBhIGZpbGVcclxuICAgICAgICAgIGN1cnJlbnRbcGFydF0gPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jYWNoZWRSZWFkKGZpbGUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAvLyBUaGlzIGlzIGEgZGlyZWN0b3J5XHJcbiAgICAgICAgICBpZiAoIWN1cnJlbnRbcGFydF0pIHtcclxuICAgICAgICAgICAgY3VycmVudFtwYXJ0XSA9IHt9O1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50W3BhcnRdO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBvdXRwdXQ7XHJcbiAgfVxyXG5cclxuICBhc3luYyBpbml0aWFsaXplUHJvZmlsZXMoKSB7XHJcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MucHJvZmlsZXMgfHwgdGhpcy5zZXR0aW5ncy5wcm9maWxlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgdGhpcy5zZXR0aW5ncy5wcm9maWxlcyA9IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBuYW1lOiBcIk9wZW5BSSBEZWZhdWx0XCIsXHJcbiAgICAgICAgICBlbmRwb2ludDogXCJodHRwczovL2FwaS5vcGVuYWkuY29tL3YxL2VtYmVkZGluZ3NcIixcclxuICAgICAgICAgIGhlYWRlcnM6IEpTT04uc3RyaW5naWZ5KFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXHJcbiAgICAgICAgICAgICAgQXV0aG9yaXphdGlvbjogXCJCZWFyZXIgc2stP1wiLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBudWxsLFxyXG4gICAgICAgICAgICAyXHJcbiAgICAgICAgICApLFxyXG4gICAgICAgICAgcmVxdWVzdEJvZHk6IEpTT04uc3RyaW5naWZ5KFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgbW9kZWw6IFwidGV4dC1lbWJlZGRpbmctYWRhLTAwMlwiLFxyXG4gICAgICAgICAgICAgIGlucHV0OiBcIntlbWJlZF9pbnB1dH1cIixcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgbnVsbCxcclxuICAgICAgICAgICAgMlxyXG4gICAgICAgICAgKSxcclxuICAgICAgICAgIHJlc3BvbnNlSlNPTjogSlNPTi5zdHJpbmdpZnkoXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICBkYXRhOiBbXHJcbiAgICAgICAgICAgICAgICB7IGVtYmVkZGluZzogXCJ7ZW1iZWRfb3V0cHV0fVwiLCBpbmRleDogMCwgb2JqZWN0OiBcImVtYmVkZGluZ1wiIH0sXHJcbiAgICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgICBtb2RlbDogXCJ0ZXh0LWVtYmVkZGluZy1hZGEtMDAyLXYyXCIsXHJcbiAgICAgICAgICAgICAgb2JqZWN0OiBcImxpc3RcIixcclxuICAgICAgICAgICAgICB1c2FnZTogeyBwcm9tcHRfdG9rZW5zOiAxMiwgdG90YWxfdG9rZW5zOiAxMiB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBudWxsLFxyXG4gICAgICAgICAgICAyXHJcbiAgICAgICAgICApLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF07XHJcbiAgICAgIHRoaXMuc2V0dGluZ3Muc2VsZWN0ZWRQcm9maWxlSW5kZXggPSAwO1xyXG4gICAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuY29uc3QgU01BUlRfQ09OTkVDVElPTlNfVklFV19UWVBFID0gXCJzbWFydC1jb25uZWN0aW9ucy12aWV3XCI7XHJcbmNsYXNzIFNtYXJ0Q29ubmVjdGlvbnNWaWV3IGV4dGVuZHMgT2JzaWRpYW4uSXRlbVZpZXcge1xyXG4gIGNvbnN0cnVjdG9yKGxlYWYsIHBsdWdpbikge1xyXG4gICAgc3VwZXIobGVhZik7XHJcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuICAgIHRoaXMubmVhcmVzdCA9IG51bGw7XHJcbiAgICB0aGlzLmxvYWRfd2FpdCA9IG51bGw7XHJcbiAgfVxyXG4gIGdldFZpZXdUeXBlKCkge1xyXG4gICAgcmV0dXJuIFNNQVJUX0NPTk5FQ1RJT05TX1ZJRVdfVFlQRTtcclxuICB9XHJcblxyXG4gIGdldERpc3BsYXlUZXh0KCkge1xyXG4gICAgcmV0dXJuIFwiU21hcnQgQ29ubmVjdGlvbnMgRmlsZXNcIjtcclxuICB9XHJcblxyXG4gIGdldEljb24oKSB7XHJcbiAgICByZXR1cm4gXCJzbWFydC1jb25uZWN0aW9uc1wiO1xyXG4gIH1cclxuXHJcbiAgc2V0X21lc3NhZ2UobWVzc2FnZSkge1xyXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5jb250YWluZXJFbC5jaGlsZHJlblsxXTtcclxuICAgIC8vIGNsZWFyIGNvbnRhaW5lclxyXG4gICAgY29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAvLyBpbml0aWF0ZSB0b3AgYmFyXHJcbiAgICB0aGlzLmluaXRpYXRlX3RvcF9iYXIoY29udGFpbmVyKTtcclxuICAgIC8vIGlmIG1lc2FnZSBpcyBhbiBhcnJheSwgbG9vcCB0aHJvdWdoIGFuZCBjcmVhdGUgYSBuZXcgcCBlbGVtZW50IGZvciBlYWNoIG1lc3NhZ2VcclxuICAgIGlmIChBcnJheS5pc0FycmF5KG1lc3NhZ2UpKSB7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVzc2FnZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnRhaW5lci5jcmVhdGVFbChcInBcIiwgeyBjbHM6IFwic2NfbWVzc2FnZVwiLCB0ZXh0OiBtZXNzYWdlW2ldIH0pO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBjcmVhdGUgcCBlbGVtZW50IHdpdGggbWVzc2FnZVxyXG4gICAgICBjb250YWluZXIuY3JlYXRlRWwoXCJwXCIsIHsgY2xzOiBcInNjX21lc3NhZ2VcIiwgdGV4dDogbWVzc2FnZSB9KTtcclxuICAgIH1cclxuICB9XHJcbiAgcmVuZGVyX2xpbmtfdGV4dChsaW5rLCBzaG93X2Z1bGxfcGF0aCA9IGZhbHNlKSB7XHJcbiAgICAvKipcclxuICAgICAqIEJlZ2luIGludGVybmFsIGxpbmtzXHJcbiAgICAgKi9cclxuICAgIC8vIGlmIHNob3cgZnVsbCBwYXRoIGlzIGZhbHNlLCByZW1vdmUgZmlsZSBwYXRoXHJcbiAgICBpZiAoIXNob3dfZnVsbF9wYXRoKSB7XHJcbiAgICAgIGxpbmsgPSBsaW5rLnNwbGl0KFwiL1wiKS5wb3AoKTtcclxuICAgIH1cclxuICAgIC8vIGlmIGNvbnRhaW5zICcjJ1xyXG4gICAgaWYgKGxpbmsuaW5kZXhPZihcIiNcIikgPiAtMSkge1xyXG4gICAgICAvLyBzcGxpdCBhdCAubWRcclxuICAgICAgbGluayA9IGxpbmsuc3BsaXQoXCIubWRcIik7XHJcbiAgICAgIC8vIHdyYXAgZmlyc3QgcGFydCBpbiA8c21hbGw+IGFuZCBhZGQgbGluZSBicmVha1xyXG4gICAgICBsaW5rWzBdID0gYDxzbWFsbD4ke2xpbmtbMF19PC9zbWFsbD48YnI+YDtcclxuICAgICAgLy8gam9pbiBiYWNrIHRvZ2V0aGVyXHJcbiAgICAgIGxpbmsgPSBsaW5rLmpvaW4oXCJcIik7XHJcbiAgICAgIC8vIHJlcGxhY2UgJyMnIHdpdGggJyBcdTAwQkIgJ1xyXG4gICAgICBsaW5rID0gbGluay5yZXBsYWNlKC8jL2csIFwiIFx1MDBCQiBcIik7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyByZW1vdmUgJy5tZCdcclxuICAgICAgbGluayA9IGxpbmsucmVwbGFjZShcIi5tZFwiLCBcIlwiKTtcclxuICAgIH1cclxuICAgIHJldHVybiBsaW5rO1xyXG4gIH1cclxuXHJcbiAgc2V0X25lYXJlc3QobmVhcmVzdCwgbmVhcmVzdF9jb250ZXh0ID0gbnVsbCwgcmVzdWx0c19vbmx5ID0gZmFsc2UpIHtcclxuICAgIC8vIGdldCBjb250YWluZXIgZWxlbWVudFxyXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5jb250YWluZXJFbC5jaGlsZHJlblsxXTtcclxuICAgIC8vIGlmIHJlc3VsdHMgb25seSBpcyBmYWxzZSwgY2xlYXIgY29udGFpbmVyIGFuZCBpbml0aWF0ZSB0b3AgYmFyXHJcbiAgICBpZiAoIXJlc3VsdHNfb25seSkge1xyXG4gICAgICAvLyBjbGVhciBjb250YWluZXJcclxuICAgICAgY29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAgIHRoaXMuaW5pdGlhdGVfdG9wX2Jhcihjb250YWluZXIsIG5lYXJlc3RfY29udGV4dCk7XHJcbiAgICB9XHJcbiAgICAvLyB1cGRhdGUgcmVzdWx0c1xyXG4gICAgdGhpcy5wbHVnaW4udXBkYXRlX3Jlc3VsdHMoY29udGFpbmVyLCBuZWFyZXN0KTtcclxuICB9XHJcblxyXG4gIGluaXRpYXRlX3RvcF9iYXIoY29udGFpbmVyLCBuZWFyZXN0X2NvbnRleHQgPSBudWxsKSB7XHJcbiAgICBsZXQgdG9wX2JhcjtcclxuICAgIC8vIGlmIHRvcCBiYXIgYWxyZWFkeSBleGlzdHMsIGVtcHR5IGl0XHJcbiAgICBpZiAoXHJcbiAgICAgIGNvbnRhaW5lci5jaGlsZHJlbi5sZW5ndGggPiAwICYmXHJcbiAgICAgIGNvbnRhaW5lci5jaGlsZHJlblswXS5jbGFzc0xpc3QuY29udGFpbnMoXCJzYy10b3AtYmFyXCIpXHJcbiAgICApIHtcclxuICAgICAgdG9wX2JhciA9IGNvbnRhaW5lci5jaGlsZHJlblswXTtcclxuICAgICAgdG9wX2Jhci5lbXB0eSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gaW5pdCBjb250YWluZXIgZm9yIHRvcCBiYXJcclxuICAgICAgdG9wX2JhciA9IGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJzYy10b3AtYmFyXCIgfSk7XHJcbiAgICB9XHJcbiAgICAvLyBpZiBoaWdobGlnaHRlZCB0ZXh0IGlzIG5vdCBudWxsLCBjcmVhdGUgcCBlbGVtZW50IHdpdGggaGlnaGxpZ2h0ZWQgdGV4dFxyXG4gICAgaWYgKG5lYXJlc3RfY29udGV4dCkge1xyXG4gICAgICB0b3BfYmFyLmNyZWF0ZUVsKFwicFwiLCB7IGNsczogXCJzYy1jb250ZXh0XCIsIHRleHQ6IG5lYXJlc3RfY29udGV4dCB9KTtcclxuICAgIH1cclxuICAgIC8vIGFkZCBzZWFyY2ggYnV0dG9uXHJcbiAgICBjb25zdCBzZWFyY2hfYnV0dG9uID0gdG9wX2Jhci5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIGNsczogXCJzYy1zZWFyY2gtYnV0dG9uXCIsXHJcbiAgICB9KTtcclxuICAgIC8vIGFkZCBpY29uIHRvIHNlYXJjaCBidXR0b25cclxuICAgIE9ic2lkaWFuLnNldEljb24oc2VhcmNoX2J1dHRvbiwgXCJzZWFyY2hcIik7XHJcbiAgICAvLyBhZGQgY2xpY2sgbGlzdGVuZXIgdG8gc2VhcmNoIGJ1dHRvblxyXG4gICAgc2VhcmNoX2J1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICAvLyBlbXB0eSB0b3AgYmFyXHJcbiAgICAgIHRvcF9iYXIuZW1wdHkoKTtcclxuICAgICAgLy8gY3JlYXRlIGlucHV0IGVsZW1lbnRcclxuICAgICAgY29uc3Qgc2VhcmNoX2NvbnRhaW5lciA9IHRvcF9iYXIuY3JlYXRlRWwoXCJkaXZcIiwge1xyXG4gICAgICAgIGNsczogXCJzZWFyY2gtaW5wdXQtY29udGFpbmVyXCIsXHJcbiAgICAgIH0pO1xyXG4gICAgICBjb25zdCBpbnB1dCA9IHNlYXJjaF9jb250YWluZXIuY3JlYXRlRWwoXCJpbnB1dFwiLCB7XHJcbiAgICAgICAgY2xzOiBcInNjLXNlYXJjaC1pbnB1dFwiLFxyXG4gICAgICAgIHR5cGU6IFwic2VhcmNoXCIsXHJcbiAgICAgICAgcGxhY2Vob2xkZXI6IFwiVHlwZSB0byBzdGFydCBzZWFyY2guLi5cIixcclxuICAgICAgfSk7XHJcbiAgICAgIC8vIGZvY3VzIGlucHV0XHJcbiAgICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICAgIC8vIGFkZCBrZXlkb3duIGxpc3RlbmVyIHRvIGlucHV0XHJcbiAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChldmVudCkgPT4ge1xyXG4gICAgICAgIC8vIGlmIGVzY2FwZSBrZXkgaXMgcHJlc3NlZFxyXG4gICAgICAgIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIpIHtcclxuICAgICAgICAgIHRoaXMuY2xlYXJfYXV0b19zZWFyY2hlcigpO1xyXG4gICAgICAgICAgLy8gY2xlYXIgdG9wIGJhclxyXG4gICAgICAgICAgdGhpcy5pbml0aWF0ZV90b3BfYmFyKGNvbnRhaW5lciwgbmVhcmVzdF9jb250ZXh0KTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gYWRkIGtleXVwIGxpc3RlbmVyIHRvIGlucHV0XHJcbiAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAvLyBpZiB0aGlzLnNlYXJjaF90aW1lb3V0IGlzIG5vdCBudWxsIHRoZW4gY2xlYXIgaXQgYW5kIHNldCB0byBudWxsXHJcbiAgICAgICAgdGhpcy5jbGVhcl9hdXRvX3NlYXJjaGVyKCk7XHJcbiAgICAgICAgLy8gZ2V0IHNlYXJjaCB0ZXJtXHJcbiAgICAgICAgY29uc3Qgc2VhcmNoX3Rlcm0gPSBpbnB1dC52YWx1ZTtcclxuICAgICAgICAvLyBpZiBlbnRlciBrZXkgaXMgcHJlc3NlZFxyXG4gICAgICAgIGlmIChldmVudC5rZXkgPT09IFwiRW50ZXJcIiAmJiBzZWFyY2hfdGVybSAhPT0gXCJcIikge1xyXG4gICAgICAgICAgdGhpcy5zZWFyY2goc2VhcmNoX3Rlcm0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBpZiBhbnkgb3RoZXIga2V5IGlzIHByZXNzZWQgYW5kIGlucHV0IGlzIG5vdCBlbXB0eSB0aGVuIHdhaXQgNTAwbXMgYW5kIG1ha2VfY29ubmVjdGlvbnNcclxuICAgICAgICBlbHNlIGlmIChzZWFyY2hfdGVybSAhPT0gXCJcIikge1xyXG4gICAgICAgICAgLy8gY2xlYXIgdGltZW91dFxyXG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuc2VhcmNoX3RpbWVvdXQpO1xyXG4gICAgICAgICAgLy8gc2V0IHRpbWVvdXRcclxuICAgICAgICAgIHRoaXMuc2VhcmNoX3RpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5zZWFyY2goc2VhcmNoX3Rlcm0sIHRydWUpO1xyXG4gICAgICAgICAgfSwgNzAwKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyByZW5kZXIgYnV0dG9uczogXCJjcmVhdGVcIiBhbmQgXCJyZXRyeVwiIGZvciBsb2FkaW5nIGVtYmVkZGluZ3MuanNvbiBmaWxlXHJcbiAgcmVuZGVyX2VtYmVkZGluZ3NfYnV0dG9ucygpIHtcclxuICAgIC8vIGdldCBjb250YWluZXIgZWxlbWVudFxyXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5jb250YWluZXJFbC5jaGlsZHJlblsxXTtcclxuICAgIC8vIGNsZWFyIGNvbnRhaW5lclxyXG4gICAgY29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAvLyBjcmVhdGUgaGVhZGluZyB0aGF0IHNheXMgXCJFbWJlZGRpbmdzIGZpbGUgbm90IGZvdW5kXCJcclxuICAgIGNvbnRhaW5lci5jcmVhdGVFbChcImgyXCIsIHtcclxuICAgICAgY2xzOiBcInNjSGVhZGluZ1wiLFxyXG4gICAgICB0ZXh0OiBcIkVtYmVkZGluZ3MgZmlsZSBub3QgZm91bmRcIixcclxuICAgIH0pO1xyXG4gICAgLy8gY3JlYXRlIGRpdiBmb3IgYnV0dG9uc1xyXG4gICAgY29uc3QgYnV0dG9uX2RpdiA9IGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJzY0J1dHRvbkRpdlwiIH0pO1xyXG4gICAgLy8gY3JlYXRlIFwiY3JlYXRlXCIgYnV0dG9uXHJcbiAgICBjb25zdCBjcmVhdGVfYnV0dG9uID0gYnV0dG9uX2Rpdi5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIGNsczogXCJzY0J1dHRvblwiLFxyXG4gICAgICB0ZXh0OiBcIkNyZWF0ZSBlbWJlZGRpbmdzLmpzb25cIixcclxuICAgIH0pO1xyXG4gICAgLy8gbm90ZSB0aGF0IGNyZWF0aW5nIGVtYmVkZGluZ3MuanNvbiBmaWxlIHdpbGwgdHJpZ2dlciBidWxrIGVtYmVkZGluZyBhbmQgbWF5IHRha2UgYSB3aGlsZVxyXG4gICAgYnV0dG9uX2Rpdi5jcmVhdGVFbChcInBcIiwge1xyXG4gICAgICBjbHM6IFwic2NCdXR0b25Ob3RlXCIsXHJcbiAgICAgIHRleHQ6IFwiV2FybmluZzogQ3JlYXRpbmcgZW1iZWRkaW5ncy5qc29uIGZpbGUgd2lsbCB0cmlnZ2VyIGJ1bGsgZW1iZWRkaW5nIGFuZCBtYXkgdGFrZSBhIHdoaWxlXCIsXHJcbiAgICB9KTtcclxuICAgIC8vIGNyZWF0ZSBcInJldHJ5XCIgYnV0dG9uXHJcbiAgICBjb25zdCByZXRyeV9idXR0b24gPSBidXR0b25fZGl2LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcclxuICAgICAgY2xzOiBcInNjQnV0dG9uXCIsXHJcbiAgICAgIHRleHQ6IFwiUmV0cnlcIixcclxuICAgIH0pO1xyXG4gICAgLy8gdHJ5IHRvIGxvYWQgZW1iZWRkaW5ncy5qc29uIGZpbGUgYWdhaW5cclxuICAgIGJ1dHRvbl9kaXYuY3JlYXRlRWwoXCJwXCIsIHtcclxuICAgICAgY2xzOiBcInNjQnV0dG9uTm90ZVwiLFxyXG4gICAgICB0ZXh0OiBcIklmIGVtYmVkZGluZ3MuanNvbiBmaWxlIGFscmVhZHkgZXhpc3RzLCBjbGljayAnUmV0cnknIHRvIGxvYWQgaXRcIixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIGFkZCBjbGljayBldmVudCB0byBcImNyZWF0ZVwiIGJ1dHRvblxyXG4gICAgY3JlYXRlX2J1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAvLyBjcmVhdGUgZW1iZWRkaW5ncy5qc29uIGZpbGVcclxuICAgICAgY29uc3QgcHJvZmlsZVNwZWNpZmljRmlsZU5hbWUgPSBgZW1iZWRkaW5ncy0ke3RoaXMuc2VsZWN0ZWRQcm9maWxlLm5hbWV9Lmpzb25gO1xyXG4gICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zbWFydF92ZWNfbGl0ZS5pbml0X2VtYmVkZGluZ3NfZmlsZShcclxuICAgICAgICBwcm9maWxlU3BlY2lmaWNGaWxlTmFtZVxyXG4gICAgICApO1xyXG4gICAgICAvLyByZWxvYWQgdmlld1xyXG4gICAgICBhd2FpdCB0aGlzLnJlbmRlcl9jb25uZWN0aW9ucygpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gYWRkIGNsaWNrIGV2ZW50IHRvIFwicmV0cnlcIiBidXR0b25cclxuICAgIHJldHJ5X2J1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmxvZyhcInJldHJ5aW5nIHRvIGxvYWQgZW1iZWRkaW5ncy5qc29uIGZpbGVcIik7XHJcbiAgICAgIC8vIHJlbG9hZCBlbWJlZGRpbmdzLmpzb24gZmlsZVxyXG4gICAgICBjb25zdCBwcm9maWxlU3BlY2lmaWNGaWxlTmFtZSA9IGBlbWJlZGRpbmdzLSR7dGhpcy5zZWxlY3RlZFByb2ZpbGUubmFtZX0uanNvbmA7XHJcbiAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmluaXRfdmVjcyhwcm9maWxlU3BlY2lmaWNGaWxlTmFtZSk7XHJcbiAgICAgIC8vIHJlbG9hZCB2aWV3XHJcbiAgICAgIGF3YWl0IHRoaXMucmVuZGVyX2Nvbm5lY3Rpb25zKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGFzeW5jIG9uT3BlbigpIHtcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY29udGFpbmVyRWwuY2hpbGRyZW5bMV07XHJcbiAgICBjb250YWluZXIuZW1wdHkoKTtcclxuICAgIC8vIHBsYWNlaG9sZGVyIHRleHRcclxuICAgIGNvbnRhaW5lci5jcmVhdGVFbChcInBcIiwge1xyXG4gICAgICBjbHM6IFwic2NQbGFjZWhvbGRlclwiLFxyXG4gICAgICB0ZXh0OiBcIk9wZW4gYSBub3RlIHRvIGZpbmQgY29ubmVjdGlvbnMuXCIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBydW5zIHdoZW4gZmlsZSBpcyBvcGVuZWRcclxuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQoXHJcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImZpbGUtb3BlblwiLCAoZmlsZSkgPT4ge1xyXG4gICAgICAgIC8vIGlmIG5vIGZpbGUgaXMgb3BlbiwgcmV0dXJuXHJcbiAgICAgICAgaWYgKCFmaWxlKSB7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIHJldHVybiBpZiBmaWxlIHR5cGUgaXMgbm90IHN1cHBvcnRlZFxyXG4gICAgICAgIGlmIChTVVBQT1JURURfRklMRV9UWVBFUy5pbmRleE9mKGZpbGUuZXh0ZW5zaW9uKSA9PT0gLTEpIHtcclxuICAgICAgICAgIHJldHVybiB0aGlzLnNldF9tZXNzYWdlKFtcclxuICAgICAgICAgICAgXCJGaWxlOiBcIiArIGZpbGUubmFtZSxcclxuICAgICAgICAgICAgXCJVbnN1cHBvcnRlZCBmaWxlIHR5cGUgKFN1cHBvcnRlZDogXCIgK1xyXG4gICAgICAgICAgICAgIFNVUFBPUlRFRF9GSUxFX1RZUEVTLmpvaW4oXCIsIFwiKSArXHJcbiAgICAgICAgICAgICAgXCIpXCIsXHJcbiAgICAgICAgICBdKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gcnVuIHJlbmRlcl9jb25uZWN0aW9ucyBhZnRlciAxIHNlY29uZCB0byBhbGxvdyBmb3IgZmlsZSB0byBsb2FkXHJcbiAgICAgICAgaWYgKHRoaXMubG9hZF93YWl0KSB7XHJcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5sb2FkX3dhaXQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmxvYWRfd2FpdCA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5yZW5kZXJfY29ubmVjdGlvbnMoZmlsZSk7XHJcbiAgICAgICAgICB0aGlzLmxvYWRfd2FpdCA9IG51bGw7XHJcbiAgICAgICAgfSwgMTAwMCk7XHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5yZWdpc3RlckhvdmVyTGlua1NvdXJjZShTTUFSVF9DT05ORUNUSU9OU19WSUVXX1RZUEUsIHtcclxuICAgICAgZGlzcGxheTogXCJTbWFydCBDb25uZWN0aW9ucyBGaWxlc1wiLFxyXG4gICAgICBkZWZhdWx0TW9kOiB0cnVlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkodGhpcy5pbml0aWFsaXplLmJpbmQodGhpcykpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgaW5pdGlhbGl6ZSgpIHtcclxuICAgIHRoaXMuc2V0X21lc3NhZ2UoXCJMb2FkaW5nIGVtYmVkZGluZ3MgZmlsZS4uLlwiKTtcclxuICAgIC8vIGNvbnNvbGUubG9nKHRoaXMpO1xyXG4gICAgY29uc3QgcHJvZmlsZVNwZWNpZmljRmlsZU5hbWUgPSBgZW1iZWRkaW5ncy0ke1xyXG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9maWxlc1t0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleF1cclxuICAgICAgICAubmFtZVxyXG4gICAgfS5qc29uYDtcclxuICAgIGNvbnN0IHZlY3NfaW50aWF0ZWQgPSBhd2FpdCB0aGlzLnBsdWdpbi5pbml0X3ZlY3MocHJvZmlsZVNwZWNpZmljRmlsZU5hbWUpO1xyXG4gICAgLy8gY29uc3QgdmVjc19pbnRpYXRlZCA9IGF3YWl0IHRoaXMucGx1Z2luLmluaXRfdmVjcygpO1xyXG4gICAgaWYgKHZlY3NfaW50aWF0ZWQpIHtcclxuICAgICAgdGhpcy5zZXRfbWVzc2FnZShcIkVtYmVkZGluZ3MgZmlsZSBsb2FkZWQuXCIpO1xyXG4gICAgICBhd2FpdCB0aGlzLnJlbmRlcl9jb25uZWN0aW9ucygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5yZW5kZXJfZW1iZWRkaW5nc19idXR0b25zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBFWFBFUklNRU5UQUxcclxuICAgICAqIC0gd2luZG93LWJhc2VkIEFQSSBhY2Nlc3NcclxuICAgICAqIC0gY29kZS1ibG9jayByZW5kZXJpbmdcclxuICAgICAqL1xyXG4gICAgdGhpcy5hcGkgPSBuZXcgU21hcnRDb25uZWN0aW9uc1ZpZXdBcGkodGhpcy5hcHAsIHRoaXMucGx1Z2luLCB0aGlzKTtcclxuICAgIC8vIHJlZ2lzdGVyIEFQSSB0byBnbG9iYWwgd2luZG93IG9iamVjdFxyXG4gICAgKHdpbmRvd1tcIlNtYXJ0Q29ubmVjdGlvbnNWaWV3QXBpXCJdID0gdGhpcy5hcGkpICYmXHJcbiAgICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gZGVsZXRlIHdpbmRvd1tcIlNtYXJ0Q29ubmVjdGlvbnNWaWV3QXBpXCJdKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIG9uQ2xvc2UoKSB7XHJcbiAgICBjb25zb2xlLmxvZyhcImNsb3Npbmcgc21hcnQgY29ubmVjdGlvbnMgdmlld1wiKTtcclxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS51bnJlZ2lzdGVySG92ZXJMaW5rU291cmNlKFNNQVJUX0NPTk5FQ1RJT05TX1ZJRVdfVFlQRSk7XHJcbiAgICB0aGlzLnBsdWdpbi52aWV3ID0gbnVsbDtcclxuICB9XHJcblxyXG4gIGFzeW5jIHJlbmRlcl9jb25uZWN0aW9ucyhjb250ZXh0ID0gbnVsbCkge1xyXG4gICAgY29uc29sZS5sb2coXCJyZW5kZXJpbmcgY29ubmVjdGlvbnNcIik7XHJcbiAgICBpZiAoIXRoaXMucGx1Z2luLmVtYmVkZGluZ3NfbG9hZGVkKSB7XHJcbiAgICAgIGNvbnN0IHByb2ZpbGVTcGVjaWZpY0ZpbGVOYW1lID0gYGVtYmVkZGluZ3MtJHt0aGlzLnNlbGVjdGVkUHJvZmlsZS5uYW1lfS5qc29uYDtcclxuICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uaW5pdF92ZWNzKHByb2ZpbGVTcGVjaWZpY0ZpbGVOYW1lKTtcclxuICAgIH1cclxuICAgIC8vIGlmIGVtYmVkZGluZyBzdGlsbCBub3QgbG9hZGVkLCByZXR1cm5cclxuICAgIGlmICghdGhpcy5wbHVnaW4uZW1iZWRkaW5nc19sb2FkZWQpIHtcclxuICAgICAgY29uc29sZS5sb2coXCJlbWJlZGRpbmdzIGZpbGVzIHN0aWxsIG5vdCBsb2FkZWQgb3IgeWV0IHRvIGJlIGNyZWF0ZWRcIik7XHJcbiAgICAgIHRoaXMucmVuZGVyX2VtYmVkZGluZ3NfYnV0dG9ucygpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICB0aGlzLnNldF9tZXNzYWdlKFwiTWFraW5nIFNtYXJ0IENvbm5lY3Rpb25zLi4uXCIpO1xyXG4gICAgLyoqXHJcbiAgICAgKiBCZWdpbiBoaWdobGlnaHRlZC10ZXh0LWxldmVsIHNlYXJjaFxyXG4gICAgICovXHJcbiAgICBpZiAodHlwZW9mIGNvbnRleHQgPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgY29uc3QgaGlnaGxpZ2h0ZWRfdGV4dCA9IGNvbnRleHQ7XHJcbiAgICAgIC8vIGdldCBlbWJlZGRpbmcgZm9yIGhpZ2hsaWdodGVkIHRleHRcclxuICAgICAgYXdhaXQgdGhpcy5zZWFyY2goaGlnaGxpZ2h0ZWRfdGV4dCk7XHJcbiAgICAgIHJldHVybjsgLy8gZW5kcyBoZXJlIGlmIGNvbnRleHQgaXMgYSBzdHJpbmdcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEJlZ2luIGZpbGUtbGV2ZWwgc2VhcmNoXHJcbiAgICAgKi9cclxuICAgIHRoaXMubmVhcmVzdCA9IG51bGw7XHJcbiAgICB0aGlzLmludGVydmFsX2NvdW50ID0gMDtcclxuICAgIHRoaXMucmVuZGVyaW5nID0gZmFsc2U7XHJcbiAgICB0aGlzLmZpbGUgPSBjb250ZXh0O1xyXG4gICAgLy8gaWYgdGhpcy5pbnRlcnZhbCBpcyBzZXQgdGhlbiBjbGVhciBpdFxyXG4gICAgaWYgKHRoaXMuaW50ZXJ2YWwpIHtcclxuICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsKTtcclxuICAgICAgdGhpcy5pbnRlcnZhbCA9IG51bGw7XHJcbiAgICB9XHJcbiAgICAvLyBzZXQgaW50ZXJ2YWwgdG8gY2hlY2sgaWYgbmVhcmVzdCBpcyBzZXRcclxuICAgIHRoaXMuaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgIGlmICghdGhpcy5yZW5kZXJpbmcpIHtcclxuICAgICAgICBpZiAodGhpcy5maWxlIGluc3RhbmNlb2YgT2JzaWRpYW4uVEZpbGUpIHtcclxuICAgICAgICAgIHRoaXMucmVuZGVyaW5nID0gdHJ1ZTtcclxuICAgICAgICAgIHRoaXMucmVuZGVyX25vdGVfY29ubmVjdGlvbnModGhpcy5maWxlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8gZ2V0IGN1cnJlbnQgbm90ZVxyXG4gICAgICAgICAgdGhpcy5maWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcclxuICAgICAgICAgIC8vIGlmIHN0aWxsIG5vIGN1cnJlbnQgbm90ZSB0aGVuIHJldHVyblxyXG4gICAgICAgICAgaWYgKCF0aGlzLmZpbGUgJiYgdGhpcy5jb3VudCA+IDEpIHtcclxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRfbWVzc2FnZShcIk5vIGFjdGl2ZSBmaWxlXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlmICh0aGlzLm5lYXJlc3QpIHtcclxuICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5pbnRlcnZhbCk7XHJcbiAgICAgICAgICAvLyBpZiBuZWFyZXN0IGlzIGEgc3RyaW5nIHRoZW4gdXBkYXRlIHZpZXcgbWVzc2FnZVxyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLm5lYXJlc3QgPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgICAgdGhpcy5zZXRfbWVzc2FnZSh0aGlzLm5lYXJlc3QpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gc2V0IG5lYXJlc3QgY29ubmVjdGlvbnNcclxuICAgICAgICAgICAgdGhpcy5zZXRfbmVhcmVzdCh0aGlzLm5lYXJlc3QsIFwiRmlsZTogXCIgKyB0aGlzLmZpbGUubmFtZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAvLyBpZiByZW5kZXJfbG9nLmZhaWxlZF9lbWJlZGRpbmdzIHRoZW4gdXBkYXRlIGZhaWxlZF9lbWJlZGRpbmdzLnR4dFxyXG4gICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnJlbmRlcl9sb2cuZmFpbGVkX2VtYmVkZGluZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zYXZlX2ZhaWxlZF9lbWJlZGRpbmdzKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAvLyBnZXQgb2JqZWN0IGtleXMgb2YgcmVuZGVyX2xvZ1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ub3V0cHV0X3JlbmRlcl9sb2coKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5pbnRlcnZhbF9jb3VudCsrO1xyXG4gICAgICAgICAgdGhpcy5zZXRfbWVzc2FnZShcIk1ha2luZyBTbWFydCBDb25uZWN0aW9ucy4uLlwiICsgdGhpcy5pbnRlcnZhbF9jb3VudCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LCAxMCk7XHJcbiAgfVxyXG5cclxuICBhc3luYyByZW5kZXJfbm90ZV9jb25uZWN0aW9ucyhmaWxlKSB7XHJcbiAgICB0aGlzLm5lYXJlc3QgPSBhd2FpdCB0aGlzLnBsdWdpbi5maW5kX25vdGVfY29ubmVjdGlvbnMoZmlsZSk7XHJcbiAgfVxyXG5cclxuICBjbGVhcl9hdXRvX3NlYXJjaGVyKCkge1xyXG4gICAgaWYgKHRoaXMuc2VhcmNoX3RpbWVvdXQpIHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuc2VhcmNoX3RpbWVvdXQpO1xyXG4gICAgICB0aGlzLnNlYXJjaF90aW1lb3V0ID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIHNlYXJjaChzZWFyY2hfdGV4dCwgcmVzdWx0c19vbmx5ID0gZmFsc2UpIHtcclxuICAgIGNvbnN0IG5lYXJlc3QgPSBhd2FpdCB0aGlzLnBsdWdpbi5hcGkuc2VhcmNoKHNlYXJjaF90ZXh0KTtcclxuICAgIC8vIHJlbmRlciByZXN1bHRzIGluIHZpZXcgd2l0aCBmaXJzdCAxMDAgY2hhcmFjdGVycyBvZiBzZWFyY2ggdGV4dFxyXG4gICAgY29uc3QgbmVhcmVzdF9jb250ZXh0ID0gYFNlbGVjdGlvbjogXCIke1xyXG4gICAgICBzZWFyY2hfdGV4dC5sZW5ndGggPiAxMDBcclxuICAgICAgICA/IHNlYXJjaF90ZXh0LnN1YnN0cmluZygwLCAxMDApICsgXCIuLi5cIlxyXG4gICAgICAgIDogc2VhcmNoX3RleHRcclxuICAgIH1cImA7XHJcbiAgICB0aGlzLnNldF9uZWFyZXN0KG5lYXJlc3QsIG5lYXJlc3RfY29udGV4dCwgcmVzdWx0c19vbmx5KTtcclxuICB9XHJcbn1cclxuY2xhc3MgU21hcnRDb25uZWN0aW9uc1ZpZXdBcGkge1xyXG4gIGNvbnN0cnVjdG9yKGFwcCwgcGx1Z2luLCB2aWV3KSB7XHJcbiAgICB0aGlzLmFwcCA9IGFwcDtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgdGhpcy52aWV3ID0gdmlldztcclxuICB9XHJcbiAgYXN5bmMgc2VhcmNoKHNlYXJjaF90ZXh0KSB7XHJcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5wbHVnaW4uYXBpLnNlYXJjaChzZWFyY2hfdGV4dCk7XHJcbiAgfVxyXG4gIC8vIHRyaWdnZXIgcmVsb2FkIG9mIGVtYmVkZGluZ3MgZmlsZVxyXG4gIGFzeW5jIHJlbG9hZF9lbWJlZGRpbmdzX2ZpbGUoKSB7XHJcbiAgICBjb25zdCBwcm9maWxlU3BlY2lmaWNGaWxlTmFtZSA9IGBlbWJlZGRpbmdzLSR7dGhpcy5zZWxlY3RlZFByb2ZpbGUubmFtZX0uanNvbmA7XHJcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5pbml0X3ZlY3MocHJvZmlsZVNwZWNpZmljRmlsZU5hbWUpO1xyXG4gICAgYXdhaXQgdGhpcy52aWV3LnJlbmRlcl9jb25uZWN0aW9ucygpO1xyXG4gIH1cclxufVxyXG5jbGFzcyBTY1NlYXJjaEFwaSB7XHJcbiAgY29uc3RydWN0b3IoYXBwLCBwbHVnaW4pIHtcclxuICAgIHRoaXMuYXBwID0gYXBwO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG4gIGFzeW5jIHNlYXJjaChzZWFyY2hfdGV4dCwgZmlsdGVyID0ge30pIHtcclxuICAgIGZpbHRlciA9IHtcclxuICAgICAgc2tpcF9zZWN0aW9uczogdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2tpcF9zZWN0aW9ucyxcclxuICAgICAgLi4uZmlsdGVyLFxyXG4gICAgfTtcclxuICAgIGxldCBuZWFyZXN0ID0gW107XHJcbiAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5wbHVnaW4ucmVxdWVzdF9lbWJlZGRpbmdfZnJvbV9pbnB1dChzZWFyY2hfdGV4dCk7XHJcbiAgICBpZiAocmVzcCAmJiByZXNwLmRhdGEgJiYgcmVzcC5kYXRhWzBdICYmIHJlc3AuZGF0YVswXS5lbWJlZGRpbmcpIHtcclxuICAgICAgbmVhcmVzdCA9IHRoaXMucGx1Z2luLnNtYXJ0X3ZlY19saXRlLm5lYXJlc3QoXHJcbiAgICAgICAgcmVzcC5kYXRhWzBdLmVtYmVkZGluZyxcclxuICAgICAgICBmaWx0ZXJcclxuICAgICAgKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIHJlc3AgaXMgbnVsbCwgdW5kZWZpbmVkLCBvciBtaXNzaW5nIGRhdGFcclxuICAgICAgbmV3IE9ic2lkaWFuLk5vdGljZShcIlNtYXJ0IENvbm5lY3Rpb25zOiBFcnJvciBnZXR0aW5nIGVtYmVkZGluZ1wiKTtcclxuICAgIH1cclxuICAgIHJldHVybiBuZWFyZXN0O1xyXG4gIH1cclxufVxyXG5cclxuY2xhc3MgU21hcnRDb25uZWN0aW9uc1NldHRpbmdzVGFiIGV4dGVuZHMgT2JzaWRpYW4uUGx1Z2luU2V0dGluZ1RhYiB7XHJcbiAgY29uc3RydWN0b3IoYXBwLCBwbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgdGhpcy5wcm9maWxlRHJvcGRvd24gPSBudWxsO1xyXG4gICAgdGhpcy5wcm9maWxlTmFtZSA9IG51bGw7XHJcbiAgICB0aGlzLmVuZHBvaW50RmllbGQgPSBudWxsO1xyXG4gICAgdGhpcy5oZWFkZXJzRmllbGQgPSBudWxsO1xyXG4gICAgdGhpcy5yZXFCb2R5RmllbGQgPSBudWxsO1xyXG4gICAgdGhpcy5qc29uUGF0aEZpZWxkID0gbnVsbDtcclxuICAgIHRoaXMuc2VsZWN0ZWRJbmRleCA9IG51bGw7XHJcbiAgICB0aGlzLnNlbGVjdGVkUHJvZmlsZSA9IG51bGw7XHJcbiAgfVxyXG4gIGRpc3BsYXkoKSB7XHJcbiAgICBjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkVtYmVkZGluZ3MgQVBJXCIgfSk7XHJcblxyXG4gICAgLy8gUHJvZmlsZSBzZWxlY3Rpb24gZHJvcGRvd25cclxuICAgIHRoaXMucHJvZmlsZURyb3Bkb3duID0gbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiU2VsZWN0IFByb2ZpbGVcIilcclxuICAgICAgLnNldERlc2MoXCJTZWxlY3QgYW4gQVBJIHByb2ZpbGVcIilcclxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT4ge1xyXG4gICAgICAgIC8vIEFzc3VtZSBwbHVnaW4uc2V0dGluZ3MucHJvZmlsZXMgaXMgYW4gYXJyYXkgb2YgcHJvZmlsZXNcclxuICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9maWxlcy5mb3JFYWNoKChwcm9maWxlLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKGluZGV4LnRvU3RyaW5nKCksIHByb2ZpbGUubmFtZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBwcm9maWxlIHNlbGVjdGlvbiBjaGFuZ2VcclxuICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkSW5kZXggPSBwYXJzZUludCh2YWx1ZSk7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleCA9IHNlbGVjdGVkSW5kZXg7XHJcbiAgICAgICAgICB0aGlzLnNlbGVjdGVkSW5kZXggPSBzZWxlY3RlZEluZGV4O1xyXG4gICAgICAgICAgYXdhaXQgYXBwbHlQcm9maWxlKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgIC8vIEluaXRpYWxpemUgYW5kIHN0b3JlIHJlZmVyZW5jZSB0byBBUEkgZW5kcG9pbnQgZmllbGRcclxuICAgIHRoaXMucHJvZmlsZU5hbWUgPSBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJQcm9maWxlIE5hbWVcIilcclxuICAgICAgLmFkZFRleHQoXHJcbiAgICAgICAgKHRleHQpID0+IHRleHRcclxuICAgICAgICAvLyB0ZXh0Lm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xyXG4gICAgICAgIC8vICAgLyogaGFuZGxlIGNoYW5nZSAqL1xyXG4gICAgICAgIC8vIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZSBhbmQgc3RvcmUgcmVmZXJlbmNlIHRvIEFQSSBlbmRwb2ludCBmaWVsZFxyXG4gICAgdGhpcy5lbmRwb2ludEZpZWxkID0gbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiQVBJIEVuZHBvaW50XCIpXHJcbiAgICAgIC5hZGRUZXh0KFxyXG4gICAgICAgICh0ZXh0KSA9PiB0ZXh0XHJcbiAgICAgICAgLy8gdGV4dC5vbkNoYW5nZSgodmFsdWUpID0+IHtcclxuICAgICAgICAvLyAgIC8qIGhhbmRsZSBjaGFuZ2UgKi9cclxuICAgICAgICAvLyB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIC8vIFRleHQgYXJlYSBmb3IgY3VzdG9tIGhlYWRlcnNcclxuICAgIHRoaXMuaGVhZGVyc0ZpZWxkID0gbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiQ3VzdG9tIEhlYWRlcnNcIilcclxuICAgICAgLmFkZFRleHRBcmVhKCh0ZXh0QXJlYSkgPT5cclxuICAgICAgICB0ZXh0QXJlYS5vbkNoYW5nZSgoKSA9PiB7XHJcbiAgICAgICAgICAvLyBIYW5kbGUgaGVhZGVycyBjaGFuZ2VcclxuICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIC8vIFRleHQgYXJlYSBmb3IgY3VzdG9tIGhlYWRlcnNcclxuICAgIHRoaXMucmVxQm9keUZpZWxkID0gbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiUmVxdWVzdCBCb2R5XCIpXHJcbiAgICAgIC5hZGRUZXh0QXJlYSgodGV4dEFyZWEpID0+XHJcbiAgICAgICAgdGV4dEFyZWEub25DaGFuZ2UoKCkgPT4ge1xyXG4gICAgICAgICAgLy8gSGFuZGxlIGhlYWRlcnMgY2hhbmdlXHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICAvLyBUZXh0IGZpZWxkIGZvciBKU09OIHBhdGhcclxuICAgIHRoaXMuanNvblBhdGhGaWVsZCA9IG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIlJlc3BvbnNlIEpTT05cIilcclxuICAgICAgLmFkZFRleHRBcmVhKCh0ZXh0QXJlYSkgPT5cclxuICAgICAgICB0ZXh0QXJlYS5vbkNoYW5nZSgoKSA9PiB7XHJcbiAgICAgICAgICAvLyBIYW5kbGUgSlNPTiBwYXRoIGNoYW5nZVxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgY29uc3QgYXBwbHlQcm9maWxlID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgICBpZiAodGhpcy5zZWxlY3RlZEluZGV4ID49IDApIHtcclxuICAgICAgICB0aGlzLnNlbGVjdGVkUHJvZmlsZSA9XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9maWxlc1t0aGlzLnNlbGVjdGVkSW5kZXhdO1xyXG5cclxuICAgICAgICB0aGlzLnByb2ZpbGVOYW1lLmNvbXBvbmVudHNbMF0uaW5wdXRFbC52YWx1ZSA9XHJcbiAgICAgICAgICB0aGlzLnNlbGVjdGVkUHJvZmlsZS5uYW1lO1xyXG4gICAgICAgIHRoaXMuZW5kcG9pbnRGaWVsZC5jb21wb25lbnRzWzBdLmlucHV0RWwudmFsdWUgPVxyXG4gICAgICAgICAgdGhpcy5zZWxlY3RlZFByb2ZpbGUuZW5kcG9pbnQ7XHJcbiAgICAgICAgdGhpcy5oZWFkZXJzRmllbGQuY29tcG9uZW50c1swXS5pbnB1dEVsLnZhbHVlID1cclxuICAgICAgICAgIHRoaXMuc2VsZWN0ZWRQcm9maWxlLmhlYWRlcnM7XHJcbiAgICAgICAgdGhpcy5yZXFCb2R5RmllbGQuY29tcG9uZW50c1swXS5pbnB1dEVsLnZhbHVlID1cclxuICAgICAgICAgIHRoaXMuc2VsZWN0ZWRQcm9maWxlLnJlcXVlc3RCb2R5O1xyXG4gICAgICAgIHRoaXMuanNvblBhdGhGaWVsZC5jb21wb25lbnRzWzBdLmlucHV0RWwudmFsdWUgPVxyXG4gICAgICAgICAgdGhpcy5zZWxlY3RlZFByb2ZpbGUucmVzcG9uc2VKU09OO1xyXG5cclxuICAgICAgICBjb25zdCBwcm9maWxlU3BlY2lmaWNGaWxlTmFtZSA9IGBlbWJlZGRpbmdzLSR7dGhpcy5zZWxlY3RlZFByb2ZpbGUubmFtZX0uanNvbmA7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uaW5pdF92ZWNzKHByb2ZpbGVTcGVjaWZpY0ZpbGVOYW1lKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvLy8gQ3JlYXRlIGEgY29udGFpbmVyIGZvciBidXR0b25zXHJcbiAgICBjb25zdCBidXR0b25Db250YWluZXIgPSBuZXcgT2JzaWRpYW4uU2V0dGluZyhcclxuICAgICAgY29udGFpbmVyRWxcclxuICAgICkuc2V0dGluZ0VsLmNyZWF0ZURpdihcImJ1dHRvbi1jb250YWluZXJcIik7XHJcblxyXG4gICAgLy8gQWRkICdTYXZlIFByb2ZpbGUnIGJ1dHRvblxyXG4gICAgY29uc3Qgc2F2ZUJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbChcImJ1dHRvblwiLCB7XHJcbiAgICAgIHRleHQ6IFwiU2F2ZSBQcm9maWxlXCIsXHJcbiAgICB9KTtcclxuICAgIHNhdmVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgICAgLy8gR2V0IHRoZSBjdXJyZW50IHZhbHVlcyBmcm9tIHRoZSBmaWVsZHNcclxuICAgICAgY29uc3QgcHJvZmlsZU5hbWUgPSB0aGlzLnByb2ZpbGVOYW1lLmNvbXBvbmVudHNbMF0uaW5wdXRFbC52YWx1ZTsgLy8gUmVwbGFjZSB0aGlzIHdpdGggbG9naWMgdG8gZ2V0IHRoZSBuYW1lXHJcbiAgICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5lbmRwb2ludEZpZWxkLmNvbXBvbmVudHNbMF0uaW5wdXRFbC52YWx1ZTtcclxuICAgICAgY29uc3QgaGVhZGVycyA9IHRoaXMuaGVhZGVyc0ZpZWxkLmNvbXBvbmVudHNbMF0uaW5wdXRFbC52YWx1ZTtcclxuICAgICAgY29uc3QgcmVxdWVzdEJvZHkgPSB0aGlzLnJlcUJvZHlGaWVsZC5jb21wb25lbnRzWzBdLmlucHV0RWwudmFsdWU7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlSlNPTiA9IHRoaXMuanNvblBhdGhGaWVsZC5jb21wb25lbnRzWzBdLmlucHV0RWwudmFsdWU7XHJcblxyXG4gICAgICAvLyBDcmVhdGUgb3IgdXBkYXRlIHRoZSBwcm9maWxlXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9maWxlcy5maW5kSW5kZXgoXHJcbiAgICAgICAgKHApID0+IHAubmFtZSA9PT0gcHJvZmlsZU5hbWVcclxuICAgICAgKTtcclxuICAgICAgaWYgKGV4aXN0aW5nSW5kZXggPj0gMCkge1xyXG4gICAgICAgIC8vIFVwZGF0ZSBleGlzdGluZyBwcm9maWxlXHJcbiAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvZmlsZXNbZXhpc3RpbmdJbmRleF0gPSB7XHJcbiAgICAgICAgICBuYW1lOiBwcm9maWxlTmFtZSxcclxuICAgICAgICAgIGVuZHBvaW50LFxyXG4gICAgICAgICAgaGVhZGVycyxcclxuICAgICAgICAgIHJlcXVlc3RCb2R5LFxyXG4gICAgICAgICAgcmVzcG9uc2VKU09OLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gQWRkIG5ldyBwcm9maWxlXHJcbiAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvZmlsZXMucHVzaCh7XHJcbiAgICAgICAgICBuYW1lOiBwcm9maWxlTmFtZSxcclxuICAgICAgICAgIGVuZHBvaW50LFxyXG4gICAgICAgICAgaGVhZGVycyxcclxuICAgICAgICAgIHJlcXVlc3RCb2R5LFxyXG4gICAgICAgICAgcmVzcG9uc2VKU09OLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBTYXZlIHRoZSB1cGRhdGVkIHNldHRpbmdzXHJcbiAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cclxuICAgICAgLy8gQ2xlYXIgdGhlIGV4aXN0aW5nIG9wdGlvbnNcclxuICAgICAgY29uc3Qgc2VsZWN0RWxlbWVudCA9IHRoaXMucHJvZmlsZURyb3Bkb3duLmNvbXBvbmVudHNbMF0uc2VsZWN0RWw7XHJcbiAgICAgIHNlbGVjdEVsZW1lbnQuaW5uZXJIVE1MID0gXCJcIjtcclxuXHJcbiAgICAgIC8vIFJlcG9wdWxhdGUgdGhlIGRyb3Bkb3duIHdpdGggdGhlIHVwZGF0ZWQgcHJvZmlsZXMgbGlzdFxyXG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9maWxlcy5mb3JFYWNoKChwcm9maWxlLCBpbmRleCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvcHRpb25cIik7XHJcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gaW5kZXgudG9TdHJpbmcoKTtcclxuICAgICAgICBvcHRpb24udGV4dENvbnRlbnQgPSBwcm9maWxlLm5hbWU7XHJcbiAgICAgICAgc2VsZWN0RWxlbWVudC5hcHBlbmRDaGlsZChvcHRpb24pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFVwZGF0ZSB0aGUgc2VsZWN0ZWQgdmFsdWUgb2YgdGhlIGRyb3Bkb3duXHJcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ID49IDApIHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleCA9IGV4aXN0aW5nSW5kZXg7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRQcm9maWxlSW5kZXggPVxyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvZmlsZXMubGVuZ3RoIC0gMTtcclxuICAgICAgfVxyXG4gICAgICBzZWxlY3RFbGVtZW50LnZhbHVlID1cclxuICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleC50b1N0cmluZygpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkICdEZWxldGUgUHJvZmlsZScgYnV0dG9uXHJcbiAgICBjb25zdCBkZWxldGVCdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwge1xyXG4gICAgICB0ZXh0OiBcIkRlbGV0ZSBQcm9maWxlXCIsXHJcbiAgICB9KTtcclxuICAgIGRlbGV0ZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICAvLyBMb2dpYyB0byBkZWxldGUgdGhlIHNlbGVjdGVkIHByb2ZpbGVcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkV4Y2x1c2lvbnNcIiB9KTtcclxuICAgIC8vIGxpc3QgZmlsZSBleGNsdXNpb25zXHJcbiAgICBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJmaWxlX2V4Y2x1c2lvbnNcIilcclxuICAgICAgLnNldERlc2MoXCInRXhjbHVkZWQgZmlsZScgbWF0Y2hlcnMgc2VwYXJhdGVkIGJ5IGEgY29tbWEuXCIpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImRyYXdpbmdzLHByb21wdHMvbG9nc1wiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZpbGVfZXhjbHVzaW9ucylcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZmlsZV9leGNsdXNpb25zID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIGxpc3QgZm9sZGVyIGV4Y2x1c2lvbnNcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcImZvbGRlcl9leGNsdXNpb25zXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiJ0V4Y2x1ZGVkIGZvbGRlcicgbWF0Y2hlcnMgc2VwYXJhdGVkIGJ5IGEgY29tbWEuXCIpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImRyYXdpbmdzLHByb21wdHMvbG9nc1wiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZvbGRlcl9leGNsdXNpb25zKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xkZXJfZXhjbHVzaW9ucyA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICAvLyBsaXN0IHBhdGggb25seSBtYXRjaGVyc1xyXG4gICAgbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwicGF0aF9vbmx5XCIpXHJcbiAgICAgIC5zZXREZXNjKFwiJ1BhdGggb25seScgbWF0Y2hlcnMgc2VwYXJhdGVkIGJ5IGEgY29tbWEuXCIpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImRyYXdpbmdzLHByb21wdHMvbG9nc1wiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBhdGhfb25seSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGF0aF9vbmx5ID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIGxpc3QgaGVhZGVyIGV4Y2x1c2lvbnNcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcImhlYWRlcl9leGNsdXNpb25zXCIpXHJcbiAgICAgIC5zZXREZXNjKFxyXG4gICAgICAgIFwiJ0V4Y2x1ZGVkIGhlYWRlcicgbWF0Y2hlcnMgc2VwYXJhdGVkIGJ5IGEgY29tbWEuIFdvcmtzIGZvciAnYmxvY2tzJyBvbmx5LlwiXHJcbiAgICAgIClcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiZHJhd2luZ3MscHJvbXB0cy9sb2dzXCIpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuaGVhZGVyX2V4Y2x1c2lvbnMpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmhlYWRlcl9leGNsdXNpb25zID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwge1xyXG4gICAgICB0ZXh0OiBcIkRpc3BsYXlcIixcclxuICAgIH0pO1xyXG4gICAgLy8gdG9nZ2xlIHNob3dpbmcgZnVsbCBwYXRoIGluIHZpZXdcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcInNob3dfZnVsbF9wYXRoXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiU2hvdyBmdWxsIHBhdGggaW4gdmlldy5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNob3dfZnVsbF9wYXRoKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zaG93X2Z1bGxfcGF0aCA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3ModHJ1ZSk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgLy8gdG9nZ2xlIGV4cGFuZGVkIHZpZXcgYnkgZGVmYXVsdFxyXG4gICAgbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiZXhwYW5kZWRfdmlld1wiKVxyXG4gICAgICAuc2V0RGVzYyhcIkV4cGFuZGVkIHZpZXcgYnkgZGVmYXVsdC5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmV4cGFuZGVkX3ZpZXcpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmV4cGFuZGVkX3ZpZXcgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIHRvZ2dsZSBncm91cCBuZWFyZXN0IGJ5IGZpbGVcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcImdyb3VwX25lYXJlc3RfYnlfZmlsZVwiKVxyXG4gICAgICAuc2V0RGVzYyhcIkdyb3VwIG5lYXJlc3QgYnkgZmlsZS5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmdyb3VwX25lYXJlc3RfYnlfZmlsZSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ3JvdXBfbmVhcmVzdF9ieV9maWxlID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncyh0cnVlKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICAvLyB0b2dnbGUgdmlld19vcGVuIG9uIE9ic2lkaWFuIHN0YXJ0dXBcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcInZpZXdfb3BlblwiKVxyXG4gICAgICAuc2V0RGVzYyhcIk9wZW4gdmlldyBvbiBPYnNpZGlhbiBzdGFydHVwLlwiKVxyXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mudmlld19vcGVuKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy52aWV3X29wZW4gPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwge1xyXG4gICAgICB0ZXh0OiBcIkFkdmFuY2VkXCIsXHJcbiAgICB9KTtcclxuICAgIC8vIHRvZ2dsZSBsb2dfcmVuZGVyXHJcbiAgICBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJsb2dfcmVuZGVyXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiTG9nIHJlbmRlciBkZXRhaWxzIHRvIGNvbnNvbGUgKGluY2x1ZGVzIHRva2VuX3VzYWdlKS5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ19yZW5kZXIpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ19yZW5kZXIgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIHRvZ2dsZSBmaWxlcyBpbiBsb2dfcmVuZGVyXHJcbiAgICBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJsb2dfcmVuZGVyX2ZpbGVzXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiTG9nIGVtYmVkZGVkIG9iamVjdHMgcGF0aHMgd2l0aCBsb2cgcmVuZGVyIChmb3IgZGVidWdnaW5nKS5cIilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ19yZW5kZXJfZmlsZXMpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ19yZW5kZXJfZmlsZXMgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIC8vIHRvZ2dsZSBza2lwX3NlY3Rpb25zXHJcbiAgICBuZXcgT2JzaWRpYW4uU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJza2lwX3NlY3Rpb25zXCIpXHJcbiAgICAgIC5zZXREZXNjKFxyXG4gICAgICAgIFwiU2tpcHMgbWFraW5nIGNvbm5lY3Rpb25zIHRvIHNwZWNpZmljIHNlY3Rpb25zIHdpdGhpbiBub3Rlcy4gV2FybmluZzogcmVkdWNlcyB1c2VmdWxuZXNzIGZvciBsYXJnZSBmaWxlcyBhbmQgcmVxdWlyZXMgJ0ZvcmNlIFJlZnJlc2gnIGZvciBzZWN0aW9ucyB0byB3b3JrIGluIHRoZSBmdXR1cmUuXCJcclxuICAgICAgKVxyXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc2tpcF9zZWN0aW9ucylcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2tpcF9zZWN0aW9ucyA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3ModHJ1ZSk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgLy8gdGVzdCBmaWxlIHdyaXRpbmcgYnkgY3JlYXRpbmcgYSB0ZXN0IGZpbGUsIHRoZW4gd3JpdGluZyBhZGRpdGlvbmFsIGRhdGEgdG8gdGhlIGZpbGUsIGFuZCByZXR1cm5pbmcgYW55IGVycm9yIHRleHQgaWYgaXQgZmFpbHNcclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwge1xyXG4gICAgICB0ZXh0OiBcIlRlc3QgRmlsZSBXcml0aW5nXCIsXHJcbiAgICB9KTtcclxuICAgIC8vIG1hbnVhbCBzYXZlIGJ1dHRvblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7XHJcbiAgICAgIHRleHQ6IFwiTWFudWFsIFNhdmVcIixcclxuICAgIH0pO1xyXG4gICAgbGV0IG1hbnVhbF9zYXZlX3Jlc3VsdHMgPSBjb250YWluZXJFbC5jcmVhdGVFbChcImRpdlwiKTtcclxuICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIm1hbnVhbF9zYXZlXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiU2F2ZSBjdXJyZW50IGVtYmVkZGluZ3NcIilcclxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxyXG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiTWFudWFsIFNhdmVcIikub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAvLyBjb25maXJtXHJcbiAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIGNvbmZpcm0oXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gc2F2ZSB5b3VyIGN1cnJlbnQgZW1iZWRkaW5ncz9cIilcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAvLyBzYXZlXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZV9lbWJlZGRpbmdzX3RvX2ZpbGUodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgbWFudWFsX3NhdmVfcmVzdWx0cy5pbm5lckhUTUwgPSBcIkVtYmVkZGluZ3Mgc2F2ZWQgc3VjY2Vzc2Z1bGx5LlwiO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgbWFudWFsX3NhdmVfcmVzdWx0cy5pbm5lckhUTUwgPVxyXG4gICAgICAgICAgICAgICAgXCJFbWJlZGRpbmdzIGZhaWxlZCB0byBzYXZlLiBFcnJvcjogXCIgKyBlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICAvLyBsaXN0IHByZXZpb3VzbHkgZmFpbGVkIGZpbGVzXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHtcclxuICAgICAgdGV4dDogXCJQcmV2aW91c2x5IGZhaWxlZCBmaWxlc1wiLFxyXG4gICAgfSk7XHJcbiAgICBsZXQgZmFpbGVkX2xpc3QgPSBjb250YWluZXJFbC5jcmVhdGVFbChcImRpdlwiKTtcclxuICAgIHRoaXMuZHJhd19mYWlsZWRfZmlsZXNfbGlzdChmYWlsZWRfbGlzdCk7XHJcblxyXG4gICAgLy8gZm9yY2UgcmVmcmVzaCBidXR0b25cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwge1xyXG4gICAgICB0ZXh0OiBcIkZvcmNlIFJlZnJlc2hcIixcclxuICAgIH0pO1xyXG4gICAgbmV3IE9ic2lkaWFuLlNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiZm9yY2VfcmVmcmVzaFwiKVxyXG4gICAgICAuc2V0RGVzYyhcclxuICAgICAgICBcIldBUk5JTkc6IERPIE5PVCB1c2UgdW5sZXNzIHlvdSBrbm93IHdoYXQgeW91IGFyZSBkb2luZyEgVGhpcyB3aWxsIGRlbGV0ZSBhbGwgb2YgeW91ciBjdXJyZW50IGVtYmVkZGluZ3MgZnJvbSBPcGVuQUkgYW5kIHRyaWdnZXIgcmVwcm9jZXNzaW5nIG9mIHlvdXIgZW50aXJlIHZhdWx0IVwiXHJcbiAgICAgIClcclxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxyXG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiRm9yY2UgUmVmcmVzaFwiKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgIC8vIGNvbmZpcm1cclxuICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgY29uZmlybShcclxuICAgICAgICAgICAgICBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBGb3JjZSBSZWZyZXNoPyBCeSBjbGlja2luZyB5ZXMgeW91IGNvbmZpcm0gdGhhdCB5b3UgdW5kZXJzdGFuZCB0aGUgY29uc2VxdWVuY2VzIG9mIHRoaXMgYWN0aW9uLlwiXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAvLyBmb3JjZSByZWZyZXNoXHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmZvcmNlX3JlZnJlc2hfZW1iZWRkaW5nc19maWxlKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICB0aGlzLnByb2ZpbGVEcm9wZG93bi5jb21wb25lbnRzWzBdLnNlbGVjdEVsLnZhbHVlID1cclxuICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2VsZWN0ZWRQcm9maWxlSW5kZXg7XHJcbiAgICB0aGlzLnNlbGVjdGVkSW5kZXggPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZWxlY3RlZFByb2ZpbGVJbmRleDtcclxuICAgIGlmICh0aGlzLnNlbGVjdGVkSW5kZXggIT0gbnVsbCAmJiB0aGlzLnNlbGVjdGVkSW5kZXggPj0gMCkge1xyXG4gICAgICBhcHBseVByb2ZpbGUoKTsgLy8gQ2FsbCBhcHBseVByb2ZpbGUgdG8gcG9wdWxhdGUgZmllbGRzIHdpdGggc2VsZWN0ZWQgcHJvZmlsZSBkYXRhXHJcbiAgICB9XHJcbiAgICBjb25zb2xlLmxvZyh0aGlzLmVuZHBvaW50RmllbGQuY29tcG9uZW50c1swXS5pbnB1dEVsLnZhbHVlKTtcclxuICB9XHJcblxyXG4gIGRyYXdfZmFpbGVkX2ZpbGVzX2xpc3QoZmFpbGVkX2xpc3QpIHtcclxuICAgIGZhaWxlZF9saXN0LmVtcHR5KCk7XHJcbiAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuZmFpbGVkX2ZpbGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgLy8gYWRkIG1lc3NhZ2UgdGhhdCB0aGVzZSBmaWxlcyB3aWxsIGJlIHNraXBwZWQgdW50aWwgbWFudWFsbHkgcmV0cmllZFxyXG4gICAgICBmYWlsZWRfbGlzdC5jcmVhdGVFbChcInBcIiwge1xyXG4gICAgICAgIHRleHQ6IFwiVGhlIGZvbGxvd2luZyBmaWxlcyBmYWlsZWQgdG8gcHJvY2VzcyBhbmQgd2lsbCBiZSBza2lwcGVkIHVudGlsIG1hbnVhbGx5IHJldHJpZWQuXCIsXHJcbiAgICAgIH0pO1xyXG4gICAgICBsZXQgbGlzdCA9IGZhaWxlZF9saXN0LmNyZWF0ZUVsKFwidWxcIik7XHJcbiAgICAgIGZvciAobGV0IGZhaWxlZF9maWxlIG9mIHRoaXMucGx1Z2luLnNldHRpbmdzLmZhaWxlZF9maWxlcykge1xyXG4gICAgICAgIGxpc3QuY3JlYXRlRWwoXCJsaVwiLCB7XHJcbiAgICAgICAgICB0ZXh0OiBmYWlsZWRfZmlsZSxcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICAvLyBhZGQgYnV0dG9uIHRvIHJldHJ5IGZhaWxlZCBmaWxlcyBvbmx5XHJcbiAgICAgIG5ldyBPYnNpZGlhbi5TZXR0aW5nKGZhaWxlZF9saXN0KVxyXG4gICAgICAgIC5zZXROYW1lKFwicmV0cnlfZmFpbGVkX2ZpbGVzXCIpXHJcbiAgICAgICAgLnNldERlc2MoXCJSZXRyeSBmYWlsZWQgZmlsZXMgb25seVwiKVxyXG4gICAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cclxuICAgICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiUmV0cnkgZmFpbGVkIGZpbGVzIG9ubHlcIikub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIC8vIGNsZWFyIGZhaWxlZF9saXN0IGVsZW1lbnRcclxuICAgICAgICAgICAgZmFpbGVkX2xpc3QuZW1wdHkoKTtcclxuICAgICAgICAgICAgLy8gc2V0IFwicmV0cnlpbmdcIiB0ZXh0XHJcbiAgICAgICAgICAgIGZhaWxlZF9saXN0LmNyZWF0ZUVsKFwicFwiLCB7XHJcbiAgICAgICAgICAgICAgdGV4dDogXCJSZXRyeWluZyBmYWlsZWQgZmlsZXMuLi5cIixcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJldHJ5X2ZhaWxlZF9maWxlcygpO1xyXG4gICAgICAgICAgICAvLyByZWRyYXcgZmFpbGVkIGZpbGVzIGxpc3RcclxuICAgICAgICAgICAgdGhpcy5kcmF3X2ZhaWxlZF9maWxlc19saXN0KGZhaWxlZF9saXN0KTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGZhaWxlZF9saXN0LmNyZWF0ZUVsKFwicFwiLCB7XHJcbiAgICAgICAgdGV4dDogXCJObyBmYWlsZWQgZmlsZXNcIixcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBsaW5lX2lzX2hlYWRpbmcobGluZSkge1xyXG4gIHJldHVybiBsaW5lLmluZGV4T2YoXCIjXCIpID09PSAwICYmIFtcIiNcIiwgXCIgXCJdLmluZGV4T2YobGluZVsxXSkgIT09IC0xO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNtYXJ0Q29ubmVjdGlvbnNQbHVnaW47XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7OztBQUFBO0FBQUEsb0JBQUFBLFVBQUFDLFNBQUE7QUFBQSxJQUFBQSxRQUFPLFVBQVUsTUFBTSxRQUFRO0FBQUEsTUFDM0IsWUFBWSxRQUFRO0FBQ2xCLGFBQUssU0FBUztBQUFBLFVBQ1osV0FBVztBQUFBLFVBQ1gsYUFBYTtBQUFBLFVBQ2IsZ0JBQWdCO0FBQUEsVUFDaEIsZUFBZTtBQUFBLFVBQ2YsY0FBYztBQUFBLFVBQ2QsZ0JBQWdCO0FBQUEsVUFDaEIsY0FBYztBQUFBLFVBQ2QsZUFBZTtBQUFBLFVBQ2YsR0FBRztBQUFBLFFBQ0w7QUFDQSxhQUFLLFlBQVksS0FBSyxPQUFPO0FBQzdCLGFBQUssY0FBYyxPQUFPO0FBQzFCLGFBQUssWUFBWSxLQUFLLGNBQWMsTUFBTSxLQUFLO0FBQy9DLGFBQUssYUFBYTtBQUFBLE1BQ3BCO0FBQUEsTUFDQSxNQUFNLFlBQVksTUFBTTtBQUN0QixZQUFJLEtBQUssT0FBTyxnQkFBZ0I7QUFDOUIsaUJBQU8sTUFBTSxLQUFLLE9BQU8sZUFBZSxJQUFJO0FBQUEsUUFDOUMsT0FBTztBQUNMLGdCQUFNLElBQUksTUFBTSx3QkFBd0I7QUFBQSxRQUMxQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLE1BQU0sTUFBTSxNQUFNO0FBQ2hCLFlBQUksS0FBSyxPQUFPLGVBQWU7QUFDN0IsaUJBQU8sTUFBTSxLQUFLLE9BQU8sY0FBYyxJQUFJO0FBQUEsUUFDN0MsT0FBTztBQUNMLGdCQUFNLElBQUksTUFBTSx1QkFBdUI7QUFBQSxRQUN6QztBQUFBLE1BQ0Y7QUFB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UUFBVSxDQUFDLFdBQ1YsT0FBTyxjQUFjLHlCQUF5QixFQUFFLFFBQVEsWUFBWTtBQUVsRSxzQkFBWSxNQUFNO0FBRWxCLHNCQUFZLFNBQVMsS0FBSztBQUFBLFlBQ3hCLE1BQU07QUFBQSxVQUNSLENBQUM7QUFDRCxnQkFBTSxLQUFLLE9BQU8sbUJBQW1CO0FBRXJDLGVBQUssdUJBQXVCLFdBQVc7QUFBQSxRQUN6QyxDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0osT0FBTztBQUNMLGtCQUFZLFNBQVMsS0FBSztBQUFBLFFBQ3hCLE1BQU07QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRjtBQUNGO0FBRUEsU0FBUyxnQkFBZ0IsTUFBTTtBQUM3QixTQUFPLEtBQUssUUFBUSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssR0FBRyxFQUFFLFFBQVEsS0FBSyxDQUFDLENBQUMsTUFBTTtBQUNwRTtBQUVBLE9BQU8sVUFBVTsiLAogICJuYW1lcyI6IFsiZXhwb3J0cyIsICJtb2R1bGUiLCAibGluZV9saW1pdCIsICJpdGVtIiwgImxpbmsiLCAiZmlsZV9saW5rIiwgImZpbGVfbGlua19saXN0Il0KfQo=
