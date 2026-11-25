(() => {
  const docs = window.ArodDocs;
  const pages = docs.pages;
  const article = document.getElementById("article");
  const main = document.getElementById("main-content");
  const contents = document.getElementById("contents-navigation");
  const sidebarNavigation = document.getElementById("sidebar-navigation");
  const navigation = document.getElementById("documentation-navigation");
  const previousLink = document.querySelector(".previous-page");
  const nextLink = document.querySelector(".next-page");
  const searchTrigger = document.querySelector(".search-trigger");
  const searchDialog = document.getElementById("search-dialog");
  const searchInput = document.getElementById("doc-search");
  const searchStatus = document.getElementById("search-status");
  const searchResults = document.getElementById("search-results");
  const menuButton = document.querySelector(".menu-button");
  const languageButton = document.querySelector(".language-toggle");
  const themeButton = document.querySelector(".theme-toggle");
  const topbar = document.querySelector(".topbar");
  const notice = document.querySelector(".storage-notice");
  const community = document.querySelector(".community-section");
  const copyIconTemplate = community.querySelector(".copy-icon").cloneNode(true);
  const nativePopover = "popover" in HTMLElement.prototype;
  let currentLanguage = readPreference("arod-ui-language", ["en", "id"], "en");
  let currentTheme = readPreference("arod-ui-theme", ["sakura", "midnight"], "midnight");
  let noticeDismissed = readPreference("arod-ui-notice", ["dismissed"], "") === "dismissed";
  let focusAfterNavigation = false;
  let renderedHash;
  let currentHistoryEntry;
  const routeScrollPositions = new Map();
  history.scrollRestoration = "manual";
  let actionCount = 0;
  let discordCounts;
  let discordCountsRequested = false;
  let lastCopyMessage = "";
  const copyTimers = new WeakMap();

  function readPreference(key, allowed, fallback) {
    try {
      const value = localStorage.getItem(key);
      return allowed.includes(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function savePreference(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Preferences still work for this visit. */ }
  }

  function text(value) {
    return value && typeof value === "object" ? value[currentLanguage] ?? value.en ?? "" : value;
  }

  function t(en, id) { return currentLanguage === "id" ? id : en; }

  function applyTheme() {
    const dark = currentTheme === "midnight";
    document.documentElement.dataset.theme = currentTheme;
    document.querySelector('meta[name="color-scheme"]').content = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]').content = dark ? "#18141c" : "#fff9fb";
    themeButton.textContent = dark ? "Midnight" : "Sakura";
    themeButton.setAttribute("aria-label", t(`${themeButton.textContent} theme. Switch to ${dark ? "Sakura" : "Midnight"}`, `Tema ${themeButton.textContent}. Ganti ke ${dark ? "Sakura" : "Midnight"}`));
  }

  function renderDiscordCounts() {
    const numbers = new Intl.NumberFormat(currentLanguage === "id" ? "id-ID" : "en-US");
    for (const node of community.querySelectorAll("[data-discord-count]")) {
      node.textContent = discordCounts ? numbers.format(discordCounts[node.dataset.discordCount]) : "—";
    }
    community.querySelector(".community-counts-note").textContent = discordCounts
      ? t("Approximate member counts", "Perkiraan jumlah anggota")
      : discordCounts === undefined ? t("Loading member counts…", "Memuat jumlah anggota…")
      : t("Member counts unavailable. You can still join our Discord.", "Jumlah anggota tidak tersedia. Kamu tetap bisa bergabung ke Discord.");
  }

  async function loadDiscordCounts() {
    try {
      const response = await fetch("https://discord.com/api/v10/invites/A5fmd9nBbD?with_counts=true", {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Discord counts unavailable");
      const data = await response.json();
      const members = data.approximate_member_count;
      const online = data.approximate_presence_count;
      if (data.guild?.id !== "1525943679133552811" || !Number.isSafeInteger(members) || !Number.isSafeInteger(online) || online < 0 || members < online) throw new Error("Invalid Discord counts");
      discordCounts = { online, offline: members - online, members };
    } catch {
      discordCounts = null;
    }
    renderDiscordCounts();
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = text(value);
    return node;
  }

  function addInlineText(parent, value) {
    const parts = String(text(value)).split(/(`[^`]+`)/g);
    for (const part of parts) {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        parent.append(element("code", "", part.slice(1, -1)));
      } else {
        parent.append(document.createTextNode(part));
      }
    }
  }

  function appendTextList(parent, items, tag = "p", className = "") {
    for (const item of items || []) {
      const line = element(tag, className);
      addInlineText(line, item);
      parent.append(line);
    }
  }

  function groupPages() {
    const groups = new Map();
    for (const item of pages) {
      const group = text(item.group);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }
    return groups;
  }

  function renderNavigation(target) {
    target.replaceChildren();
    for (const [group, items] of groupPages()) {
      const wrapper = element("section", "nav-group");
      wrapper.append(element("h2", "nav-group-title", group));
      const list = element("ul", "nav-list");
      for (const item of items) {
        const row = element("li");
        const link = element("a", "nav-link", item.title);
        link.href = `#${item.id}`;
        link.dataset.pageLink = item.id;
        row.append(link);
        list.append(row);
      }
      wrapper.append(list);
      target.append(wrapper);
    }
  }

  function getSectionCode(sectionData) {
    return typeof sectionData.code === "string" && docs[sectionData.code]
      ? docs[sectionData.code]
      : sectionData.code;
  }

  function syntaxCode(text) {
    const fragment = document.createDocumentFragment();
    const tokens = /(--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:local|function|end|if|then|else|elseif|return|true|false|nil|and|or|not|for|do|in|while)\b|\b(?:Library|Window|Folder|Config|Advanced|UserInputService):[A-Za-z_]\w*|\bColor3\.fromRGB\b|\b\d+(?:\.\d+)?\b)/g;
    let position = 0;
    let match;
    while ((match = tokens.exec(text))) {
      if (match.index > position) fragment.append(document.createTextNode(text.slice(position, match.index)));
      const token = match[0];
      const label = token.startsWith("--") ? "tok-comment"
        : token.startsWith('"') || token.startsWith("'") ? "tok-string"
        : /^\d/.test(token) ? "tok-number"
        : token.includes(":") || token.includes("Color3.") ? "tok-api"
        : "tok-keyword";
      fragment.append(element("span", label, token));
      position = tokens.lastIndex;
    }
    if (position < text.length) fragment.append(document.createTextNode(text.slice(position)));
    return fragment;
  }

  function renderCode(sectionData, pageData) {
    const source = getSectionCode(sectionData);
    if (typeof source !== "string") return;
    const frame = element("div", "code-frame");
    const toolbar = element("div", "code-toolbar");
    const caption = element("span", "code-caption");
    const languageIcon = element("img", "code-language-icon");
    languageIcon.src = "./luau.png";
    languageIcon.alt = "";
    languageIcon.width = 20;
    languageIcon.height = 20;
    caption.append(languageIcon, element("span", "", sectionData.caption || "Luau"));
    toolbar.append(caption);

    const copyWrap = element("span", "copy-wrap");
    const copyButton = element("button", "copy-button");
    copyButton.type = "button";
    copyButton.setAttribute("aria-label", `${t("Copy code", "Salin kode")}: ${text(pageData.title)}, ${text(sectionData.title)}`);
    copyButton.setAttribute("command", "--copy");
    copyButton.setAttribute("commandfor", `snippet-${pageData.id}-${sectionData.id}`);
    copyButton.append(copyIconTemplate.cloneNode(true));
    copyButton.append(element("span", "copy-label", t("Copy", "Salin")));
    const status = element("span", "copy-feedback");
    status.setAttribute("role", "status");
    copyWrap.append(copyButton, status);
    toolbar.append(copyWrap);

    const pre = element("pre", "code-scroll");
    pre.tabIndex = 0;
    pre.setAttribute("aria-label", `${text(pageData.title)}: ${text(sectionData.title)} (${t("code", "kode")})`);
    pre.lang = "en";
    const code = element("code", "language-luau");
    code.id = `snippet-${pageData.id}-${sectionData.id}`;
    code.append(syntaxCode(source));
    const lineNumbers = element("span", "code-line-numbers", source.split("\n").map((_, index) => index + 1).join("\n"));
    lineNumbers.setAttribute("aria-hidden", "true");
    pre.append(lineNumbers, code);
    frame.append(toolbar, pre);
    return frame;
  }

  function renderTable(sectionData) {
    if (!sectionData.table) return;
    const wrap = element("div", "table-wrap");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", `${text(sectionData.title)}: ${t("reference table", "tabel referensi")}`);
    const table = element("table", "reference-table");
    table.append(element("caption", "", sectionData.title));
    const head = element("thead");
    const headerRow = element("tr");
    for (const label of sectionData.table.headers) {
      const cell = element("th", "", label);
      cell.scope = "col";
      headerRow.append(cell);
    }
    head.append(headerRow);
    const body = element("tbody");
    for (const values of sectionData.table.rows) {
      const row = element("tr");
      values.forEach((value, index) => {
        const cell = element(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        addInlineText(cell, value);
        row.append(cell);
      });
      body.append(row);
    }
    table.append(head, body);
    wrap.append(table);
    return wrap;
  }

  function renderPreview() {
    const figure = element("figure", "demo-preview");
    const frame = element("div", "demo-window");
    frame.id = "demo-window";
    const header = element("div", "demo-titlebar");
    const title = element("span", "demo-title");
    const mark = icon("shield");
    mark.classList.add("demo-title-mark");
    title.append(mark, document.createTextNode("AROD UI"));
    const collapse = element("button", "demo-title-action");
    collapse.type = "button";
    collapse.append(icon("minus"));
    collapse.setAttribute("aria-label", t("Collapse preview", "Ciutkan pratinjau"));
    collapse.setAttribute("aria-expanded", "true");
    collapse.setAttribute("aria-controls", "demo-controls");
    const close = element("button", "demo-title-action");
    close.type = "button";
    close.append(icon("x"));
    close.setAttribute("aria-label", t("Close preview", "Tutup pratinjau"));
    header.append(title, collapse, close);
    const reopen = button(t("Show preview", "Tampilkan pratinjau"), "shield");
    reopen.classList.add("demo-reopen");
    reopen.setAttribute("aria-controls", frame.id);
    reopen.hidden = true;
    const controls = element("div", "demo-content");
    controls.id = "demo-controls";
    const searchable = [];
    title.tabIndex = -1;
    searchable.push({ label: "arod UI", target: title, path: t("Window", "Jendela") });
    const status = element("p", "demo-status", "");
    status.setAttribute("role", "status");
    status.dataset.demoStatus = "";

    function icon(name) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      node.setAttribute("class", "demo-icon");
      node.setAttribute("viewBox", "0 0 24 24");
      node.setAttribute("aria-hidden", "true");
      const use = document.createElementNS(node.namespaceURI, "use");
      use.setAttribute("href", `#icon-${name}`);
      node.append(use);
      return node;
    }
    function button(label, iconName) {
      const node = element("button", "demo-button");
      node.type = "button";
      if (iconName) node.append(icon(iconName));
      node.append(element("span", "", label));
      return node;
    }
    function row(labelText, control, iconName = "", target = control) {
      const wrapper = element("div", "demo-control");
      const label = element(target.id ? "label" : "span", "demo-control-label");
      if (target.id) label.htmlFor = target.id;
      if (iconName) label.append(icon(iconName));
      label.append(document.createTextNode(labelText));
      wrapper.append(label, control);
      if (control.matches("select:not([multiple])")) wrapper.classList.add("demo-select");
      searchable.push({ label: labelText, target });
      return wrapper;
    }
    function select(id, options) {
      const node = element("select");
      node.id = id;
      node.name = id;
      for (const option of options) {
        const [value, label] = Array.isArray(option) ? option : [option, option];
        const item = element("option", "", label);
        item.value = value;
        node.append(item);
      }
      return node;
    }
    controls.append(element("h3", "demo-section-title", t("Player", "Pemain")));
    const toggle = element("button", "demo-toggle");
    toggle.type = "button";
    toggle.id = "demo-sprint";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", "Sprint");
    toggle.setAttribute("aria-checked", "false");
    toggle.dataset.demoToggle = "";
    toggle.append(element("span", "demo-toggle-knob"));
    const sliderGroup = element("span", "demo-range-group");
    const slider = element("input");
    slider.type = "range";
    slider.id = "demo-speed";
    slider.min = "16";
    slider.max = "100";
    slider.value = "16";
    const value = element("output", "demo-slider-value", "16");
    value.htmlFor = slider.id;
    value.dataset.demoSpeed = "";
    sliderGroup.append(slider, value);
    const choice = select("demo-team", [["rose", "Rose"], ["mint", "Mint"], ["sky", "Sky"]]);
    choice.dataset.demoTeam = "";
    const tools = select("demo-tools", [["Map", t("Map", "Peta")], ["Compass", t("Compass", "Kompas")], ["Lantern", t("Lantern", "Lentera")]]);
    tools.multiple = true;
    tools.selectedIndex = -1;
    tools.size = 3;
    const toolsGroup = element("details", "demo-tools demo-disclosure");
    const toolsSummary = element("summary");
    const toolsHeading = element("span", "demo-select-heading", t("Tools", "Alat"));
    const toolsValue = element("span", "demo-tools-value");
    const toolsCount = element("span", "demo-badge");
    toolsSummary.append(icon("briefcase"), toolsHeading, toolsValue, toolsCount);
    const toolsLabel = element("label", "visually-hidden", t("Tools · choose up to 2", "Alat · pilih maks. 2"));
    toolsLabel.htmlFor = tools.id;
    toolsGroup.append(toolsSummary, toolsLabel, tools);
    searchable.push({ label: t("Tools", "Alat"), target: tools });
    const actions = element("div", "demo-actions");
    const runButton = button(t("Run action", "Jalankan aksi"), "play");
    runButton.dataset.demoAction = "";
    const clearTools = button(t("Clear tools", "Hapus alat"), "x");
    actions.append(runButton, clearTools);
    const speedRow = row(t("Walk speed", "Kecepatan berjalan"), sliderGroup, "", slider);
    speedRow.classList.add("demo-slider");
    controls.append(row("Sprint", toggle, "zap"), speedRow, row(t("Team", "Tim"), choice, "users"), toolsGroup);

    controls.append(element("h3", "demo-section-title", t("Inputs", "Input")));
    const name = element("input");
    name.id = "demo-name";
    name.type = "text";
    name.value = "Guest";
    name.placeholder = t("Enter a name…", "Masukkan nama…");
    name.autocomplete = "off";
    name.maxLength = 64;
    const binding = button("F");
    binding.id = "demo-binding";
    binding.classList.add("demo-keybind");
    binding.dataset.key = "F";
    controls.append(row(t("Player name", "Nama pemain"), name, "user"), row(t("Activate", "Aktifkan"), binding, "keyboard"), actions);
    searchable.push({ label: runButton.textContent, target: runButton }, { label: clearTools.textContent, target: clearTools });

    const folder = element("details", "demo-folder demo-disclosure");
    const summary = element("summary");
    summary.append(icon("settings"), document.createTextNode(t("Advanced", "Lanjutan")));
    const folderBody = element("div", "demo-folder-content");
    const folderToggle = element("input");
    folderToggle.id = "demo-extra";
    folderToggle.type = "checkbox";
    const folderButton = button(t("Run folder action", "Jalankan aksi folder"), "play");
    searchable.push({ label: folderButton.textContent, target: folderButton });
    folderButton.addEventListener("click", () => { status.textContent = t("Folder action ran in this preview.", "Aksi folder dijalankan di pratinjau ini."); });
    folderBody.append(element("p", "demo-helper", t("Additional controls live here.", "Kontrol tambahan ada di sini.")), row(t("Extra controls", "Kontrol tambahan"), folderToggle, "zap"), folderButton);
    folder.append(summary, folderBody);
    const configFolder = element("details", "demo-config-folder demo-disclosure");
    configFolder.open = true;
    const configSummary = element("summary");
    configSummary.append(icon("save"), document.createTextNode(t("Configs", "Konfigurasi")));
    const configBody = element("div", "demo-folder-content");
    const theme = select("demo-theme", ["Rose", "Crimson", "Ocean", "Sakura"]);
    configBody.append(row(t("Theme", "Tema"), theme, "palette"));
    configFolder.append(configSummary, configBody);
    controls.append(folder, configFolder);

    const configName = element("textarea");
    configName.rows = 2;
    configName.id = "demo-config-name";
    configName.placeholder = t("Name your config", "Beri nama konfigurasi");
    configName.maxLength = 48;
    configName.autocomplete = "off";
    const create = button(t("Create config", "Buat konfigurasi"));
    create.dataset.demoCreate = "";
    const createRow = element("div", "demo-inline");
    const configNameLabel = element("label", "visually-hidden", t("New config", "Konfigurasi baru"));
    configNameLabel.htmlFor = configName.id;
    createRow.append(configNameLabel, configName, create);
    const configList = select("demo-configs", []);
    configList.size = 2;
    const configListRow = element("div", "demo-config-picker");
    const configDisclosure = element("details", "demo-config-list demo-disclosure");
    const configListSummary = element("summary");
    const configValue = element("span", "demo-config-value");
    configListSummary.append(icon("folder"), element("span", "demo-select-heading", t("Configs", "Konfigurasi")), configValue);
    const configListLabel = element("label", "visually-hidden", t("Saved configs", "Konfigurasi tersimpan"));
    configListLabel.htmlFor = configList.id;
    const configEmpty = element("p", "demo-config-empty", t("No configs yet. Name one above and press Create.", "Belum ada konfigurasi. Beri nama di atas lalu tekan Buat konfigurasi."));
    const configOptions = element("div", "demo-config-options");
    configOptions.append(configListLabel, configEmpty, configList);
    configDisclosure.append(configListSummary, configOptions);
    searchable.push({ label: t("Configs", "Konfigurasi"), target: configListSummary });
    const refresh = button("", "refresh");
    refresh.classList.add("demo-config-refresh");
    refresh.setAttribute("aria-label", t("Refresh configs", "Segarkan konfigurasi"));
    configListRow.append(configDisclosure, refresh);
    const load = button(t("Load selected", "Muat pilihan"));
    load.dataset.demoLoad = "";
    const save = button(t("Save to selected", "Simpan ke pilihan"));
    save.dataset.demoSave = "";
    const configActions = element("div", "demo-actions");
    configActions.append(load, save);
    const autoLoad = element("input");
    autoLoad.id = "demo-autoload";
    autoLoad.type = "checkbox";
    autoLoad.className = "demo-switch";
    autoLoad.setAttribute("role", "switch");
    const autoLoadRow = row(t("Auto load config", "Muat konfigurasi otomatis"), autoLoad);
    autoLoadRow.classList.add("demo-checkbox");
    configBody.append(createRow, configListRow, configActions, autoLoadRow);
    searchable.push({ label: t("New config", "Konfigurasi baru"), target: configName }, ...[create, load, save].map((target) => ({ label: target.textContent, target })));

    const search = element("input");
    search.id = "demo-search";
    search.type = "search";
    search.placeholder = t("Find a control…", "Cari kontrol…");
    const searchRow = element("div", "demo-search");
    const searchLabel = element("label", "visually-hidden", t("Find a control", "Cari kontrol"));
    searchLabel.htmlFor = search.id;
    const searchClear = button("", "x");
    searchClear.classList.add("demo-search-clear");
    searchClear.setAttribute("aria-label", t("Clear control search", "Hapus pencarian kontrol"));
    searchClear.hidden = true;
    const searchNote = element("p", "demo-search-note", t("Type to search", "Ketik untuk mencari"));
    searchNote.id = "demo-search-note";
    searchNote.setAttribute("role", "status");
    search.setAttribute("aria-describedby", searchNote.id);
    searchRow.append(searchLabel, icon("search"), search, searchClear);
    const results = element("ul", "demo-search-results");
    controls.append(searchRow, searchNote, results);

    function capture() {
      return { sprint: toggle.getAttribute("aria-checked"), speed: slider.value, team: choice.value, tools: [...tools.selectedOptions].map((option) => option.value), name: name.value, key: binding.dataset.key, theme: theme.value, extra: folderToggle.checked };
    }
    function repaint() {
      value.value = slider.value;
      slider.style.setProperty("--demo-progress", `${(slider.value - slider.min) / (slider.max - slider.min) * 100}%`);
      frame.dataset.previewTheme = theme.value;
      const selected = [...tools.selectedOptions];
      toolsValue.textContent = selected.length ? selected.map((option) => option.textContent).join(", ") : t("Select…", "Pilih…");
      toolsCount.textContent = `${selected.length}/2`;
    }
    const configs = new Map();
    function refreshConfigs(selected = configList.value) {
      const placeholder = element("option", "", configs.size ? t("Select a config", "Pilih konfigurasi") : t("No configs yet", "Belum ada konfigurasi"));
      placeholder.value = "";
      placeholder.disabled = true;
      configList.replaceChildren(placeholder);
      for (const name of configs.keys()) {
        const option = element("option", "", name);
        option.value = name;
        configList.append(option);
      }
      configList.value = configs.has(selected) ? selected : "";
      configList.disabled = configs.size === 0;
      configList.hidden = configs.size === 0;
      configList.size = Math.min(5, Math.max(2, configs.size));
      configEmpty.hidden = configs.size > 0;
      configValue.textContent = configList.value || placeholder.textContent;
      configValue.classList.toggle("demo-config-empty-value", !configList.value);
    }
    refreshConfigs();
    configList.addEventListener("change", () => {
      configValue.textContent = configList.value;
      configValue.classList.remove("demo-config-empty-value");
      configDisclosure.open = false;
      configListSummary.focus();
    });
    toggle.addEventListener("click", () => {
      const on = toggle.getAttribute("aria-checked") !== "true";
      toggle.setAttribute("aria-checked", String(on));
      status.textContent = t(`Sprint is ${on ? "on" : "off"}.`, `Sprint ${on ? "aktif" : "nonaktif"}.`);
    });
    slider.addEventListener("input", () => { repaint(); status.textContent = t(`Walk speed: ${slider.value}.`, `Kecepatan berjalan: ${slider.value}.`); });
    choice.addEventListener("change", () => { status.textContent = `${t("Team", "Tim")}: ${choice.selectedOptions[0].textContent}.`; });
    tools.addEventListener("change", () => {
      [...tools.selectedOptions].slice(2).forEach((option) => { option.selected = false; });
      repaint();
      status.textContent = t(`${tools.selectedOptions.length} of 2 tools selected.`, `${tools.selectedOptions.length} dari 2 alat dipilih.`);
    });
    clearTools.addEventListener("click", () => { tools.selectedIndex = -1; repaint(); status.textContent = t("Selection cleared.", "Pilihan dihapus."); });
    runButton.addEventListener("click", () => { actionCount += 1; status.textContent = t(`Action ${actionCount} ran in this preview.`, `Aksi ${actionCount} dijalankan di pratinjau ini.`); });
    name.addEventListener("change", () => { status.textContent = `${t("Player name", "Nama pemain")}: ${name.value}.`; });
    binding.addEventListener("click", () => { binding.dataset.listening = ""; binding.textContent = t("Press a key…", "Tekan tombol…"); });
    binding.addEventListener("keydown", (event) => {
      if (!binding.hasAttribute("data-listening")) return;
      if (event.key !== "Tab") event.preventDefault();
      event.stopPropagation();
      if (!["Escape", "Tab"].includes(event.key)) binding.dataset.key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
      binding.textContent = binding.dataset.key;
      binding.removeAttribute("data-listening");
    });
    binding.addEventListener("blur", () => { binding.textContent = binding.dataset.key; binding.removeAttribute("data-listening"); });
    create.addEventListener("click", () => {
      const config = configName.value.trim();
      if (!config || configs.has(config)) { status.textContent = t("Enter a new config name.", "Masukkan nama konfigurasi baru."); return; }
      configs.set(config, capture());
      refreshConfigs(config);
      configName.value = "";
      status.textContent = t(`Created ${config} for this preview.`, `${config} dibuat untuk pratinjau ini.`);
    });
    refresh.addEventListener("click", () => { refreshConfigs(); status.textContent = t("Configs refreshed.", "Konfigurasi disegarkan."); });
    save.addEventListener("click", () => {
      if (!configs.has(configList.value)) { status.textContent = t("Pick a config first.", "Pilih konfigurasi terlebih dahulu."); return; }
      configs.set(configList.value, capture());
      status.textContent = t("Saved for this preview only.", "Disimpan hanya untuk pratinjau ini.");
    });
    load.addEventListener("click", () => {
      const saved = configs.get(configList.value);
      if (!saved) { status.textContent = t("Pick a config first.", "Pilih konfigurasi terlebih dahulu."); return; }
      toggle.setAttribute("aria-checked", saved.sprint);
      slider.value = saved.speed;
      choice.value = saved.team;
      for (const option of tools.options) option.selected = saved.tools.includes(option.value);
      name.value = saved.name;
      binding.dataset.key = binding.textContent = saved.key;
      theme.value = saved.theme;
      folderToggle.checked = saved.extra;
      repaint();
      status.textContent = t("Loaded preview settings.", "Pengaturan pratinjau dimuat.");
    });
    autoLoad.addEventListener("change", () => { status.textContent = t("Auto load is illustrated here; preview settings are not kept after reload.", "Muat otomatis hanya ilustrasi; pengaturan pratinjau tidak disimpan setelah pemuatan ulang."); });
    theme.addEventListener("change", () => { repaint(); status.textContent = `${t("Preview theme", "Tema pratinjau")}: ${theme.value}.`; });
    function updatePreviewSearch() {
      results.replaceChildren();
      const query = search.value.trim().toLowerCase();
      searchClear.hidden = !search.value;
      searchNote.hidden = false;
      if (!query) { searchNote.textContent = t("Type to search", "Ketik untuk mencari"); return; }
      const matches = searchable.filter((item) => item.label.toLowerCase().includes(query))
        .sort((a, b) => Number(b.label.toLowerCase().startsWith(query)) - Number(a.label.toLowerCase().startsWith(query)));
      for (const item of matches) {
        const result = element("li");
        const go = button(item.label);
        const parent = item.target.closest(".demo-folder, .demo-config-folder");
        const path = item.path || (parent ? `arod UI › ${parent.querySelector("summary").textContent}` : "arod UI");
        go.append(element("span", "demo-result-path", path));
        go.addEventListener("click", () => {
          for (let parent = item.target.closest("details"); parent; parent = parent.parentElement.closest("details")) parent.open = true;
          item.target.focus();
        });
        result.append(go);
        results.append(result);
      }
      searchNote.hidden = matches.length > 0;
      searchNote.textContent = matches.length
        ? t(`${matches.length} controls found.`, `${matches.length} kontrol ditemukan.`)
        : t("Nothing found", "Tidak ada hasil");
    }
    search.addEventListener("input", updatePreviewSearch);
    searchClear.addEventListener("click", () => {
      search.value = "";
      updatePreviewSearch();
      search.focus();
    });
    collapse.addEventListener("click", () => {
      controls.hidden = !controls.hidden;
      collapse.querySelector("use").setAttribute("href", controls.hidden ? "#icon-plus" : "#icon-minus");
      collapse.setAttribute("aria-expanded", String(!controls.hidden));
      collapse.setAttribute("aria-label", controls.hidden ? t("Expand preview", "Buka pratinjau") : t("Collapse preview", "Ciutkan pratinjau"));
    });
    close.addEventListener("click", () => {
      frame.hidden = true;
      reopen.hidden = false;
      reopen.focus();
    });
    reopen.addEventListener("click", () => {
      frame.hidden = false;
      reopen.hidden = true;
      collapse.focus();
    });
    const caption = element("figcaption", "demo-caption", t("Interactive preview of the live arod layout. Scroll inside to try inputs, folders, configs, and themes. Settings reset when you leave this page; no Roblox connection.", "Pratinjau interaktif tata letak arod. Gulir di dalam jendela untuk mencoba input, folder, konfigurasi, dan tema. Pengaturan direset saat meninggalkan halaman ini; tidak terhubung ke Roblox."));
    repaint();
    frame.append(header, controls);
    figure.append(frame, reopen, status, caption);
    return figure;
  }

  function renderSection(sectionData, pageData) {
    const wrapper = element("section", "doc-section");
    wrapper.id = sectionData.id;
    const heading = element("h2", "", sectionData.title);
    wrapper.append(heading);
    appendTextList(wrapper, sectionData.body);
    if (sectionData.preview) wrapper.append(renderPreview());
    if (sectionData.bullets) {
      const list = element("ul", "doc-list");
      for (const item of sectionData.bullets) {
        const line = element("li");
        addInlineText(line, item);
        list.append(line);
      }
      wrapper.append(list);
    }
    if (sectionData.note) {
      const note = element("p", "note");
      addInlineText(note, sectionData.note);
      wrapper.append(note);
    }
    const code = renderCode(sectionData, pageData);
    if (code) wrapper.append(code);
    const table = renderTable(sectionData);
    if (table) wrapper.append(table);
    return wrapper;
  }

  function setupPreviousNext(currentIndex) {
    const links = [[previousLink, pages[currentIndex - 1], t("Previous", "Sebelumnya")], [nextLink, pages[currentIndex + 1], t("Next", "Selanjutnya")]];
    for (const [anchor, item, label] of links) {
      anchor.replaceChildren();
      anchor.hidden = !item;
      if (!item) continue;
      anchor.href = `#${item.id}`;
      anchor.append(element("span", "page-nav-label", label), element("span", "page-nav-title", item.title));
    }
  }

  function renderContents(pageData) {
    contents.replaceChildren();
    const list = element("ul", "contents-list");
    for (const item of pageData.sections) {
      const row = element("li");
      const link = element("a", "contents-link", item.title);
      link.href = `#${pageData.id}/${item.id}`;
      link.dataset.sectionLink = item.id;
      row.append(link);
      list.append(row);
    }
    contents.append(list);
  }

  function parseRoute() {
    const raw = location.hash.slice(1);
    let parts;
    try {
      parts = raw.split("/").map(decodeURIComponent);
    } catch {
      return { invalid: true };
    }
    const pageIndex = pages.findIndex((item) => item.id === parts[0]);
    const pageData = pages[pageIndex < 0 ? 0 : pageIndex];
    const target = parts[1] && pageData.sections.find((item) => item.id === parts[1]);
    return {
      pageData,
      pageIndex: pageIndex < 0 ? 0 : pageIndex,
      target,
      invalid: (raw.length > 0 && pageIndex < 0) || (parts[1] !== undefined && !target),
      raw,
    };
  }

  function renderRoute(event) {
    if (event?.type === "hashchange" && renderedHash === location.hash) return;
    const initialRoute = renderedHash === undefined;
    if (currentHistoryEntry) routeScrollPositions.set(currentHistoryEntry, window.scrollY);
    let entry = history.state?.arodDocs;
    if (!entry || entry.hash !== location.hash || typeof entry.id !== "string") {
      entry = { id: crypto.randomUUID(), hash: location.hash };
      history.replaceState({ ...history.state, arodDocs: entry }, "");
    }
    currentHistoryEntry = entry.id;
    renderedHash = location.hash;
    const route = parseRoute();
    const pageData = route.pageData || pages[0];
    community.hidden = pageData.id !== "discord-support";
    if (!community.hidden && !discordCountsRequested) {
      discordCountsRequested = true;
      void loadDiscordCounts();
    }
    article.replaceChildren();
    const crumb = element("p", "breadcrumb");
    crumb.append(document.createTextNode("arod UI / "), document.createTextNode(text(pageData.group)));
    const heading = element("h1", "", pageData.title);
    heading.tabIndex = -1;
    const description = element("p", "page-description", pageData.description);
    article.append(crumb, heading, description);
    if (route.invalid) {
      const message = element("p", "note", t(`That page or section could not be found. Showing ${text(pageData.title)} instead.`, `Halaman atau bagian tersebut tidak ditemukan. Menampilkan ${text(pageData.title)}.`));
      message.setAttribute("role", "status");
      article.append(message);
    }
    for (const item of pageData.sections) article.append(renderSection(item, pageData));
    renderContents(pageData);
    setupPreviousNext(route.pageIndex);
    document.title = `${text(pageData.title)} | arod UI`;
    for (const link of document.querySelectorAll("[data-page-link]")) {
      if (link.dataset.pageLink === pageData.id) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
    const destination = route.target ? document.getElementById(route.target.id).querySelector("h2") : heading;
    const savedScroll = routeScrollPositions.get(currentHistoryEntry);
    if (focusAfterNavigation) focusDestination(destination);
    else if (event && savedScroll !== undefined) window.scrollTo({ top: savedScroll, behavior: "instant" });
    else if (route.target && (initialRoute || event)) destination.scrollIntoView({ behavior: "instant" });
    else if (event) window.scrollTo({ top: 0, behavior: "instant" });
    focusAfterNavigation = false;
  }

  function focusDestination(target) {
    updateHeaderHeight();
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "instant" });
  }

  function updateHeaderHeight() {
    document.documentElement.style.setProperty("--header-height", `${topbar.getBoundingClientRect().height}px`);
  }

  function render() {
    document.documentElement.lang = currentLanguage;
    for (const [selector, value, attribute] of [
      [".skip-link", t("Skip to documentation", "Langsung ke dokumentasi")],
      [".brand", t("arod UI home", "Beranda arod UI"), "aria-label"],
      [".menu-button span:last-child", "Menu"],
      [".menu-button", t("Toggle documentation menu", "Tampilkan atau sembunyikan menu dokumentasi"), "aria-label"],
      [".search-trigger > span:nth-child(2)", t("Search docs", "Cari dokumentasi")],
      [".search-trigger", t("Search the documentation", "Cari di dokumentasi"), "aria-label"],
      [".language-toggle", t("Switch to Bahasa Indonesia", "Ganti ke English"), "aria-label"],
      [".source-label", t("Source", "Sumber")],
      [".source-link", t("Source on GitHub", "Sumber di GitHub"), "aria-label"],
      [".sidebar", t("Documentation sidebar", "Panel dokumentasi"), "aria-label"],
      ["#documentation-navigation", t("Documentation", "Dokumentasi"), "aria-label"],
      [".sidebar-note", t("Made for the details.", "Perhatikan setiap detail.")],
      [".page-navigation", t("Documentation pages", "Halaman dokumentasi"), "aria-label"],
      [".article-footer span:first-child", t("Source-checked API reference", "Referensi API diperiksa dari sumber")],
      [".article-footer span:nth-child(2)", t("arod UI · Documentation", "arod UI · Dokumentasi")],
      [".article-footer a", t("Cookie policy", "Kebijakan cookie")],
      [".storage-notice", t("Cookie and storage notice", "Pemberitahuan cookie dan penyimpanan"), "aria-label"],
      [".storage-notice p", t("No cookies or analytics. This site remembers your theme, language and this notice on your device.", "Tanpa cookie atau analitik. Situs ini mengingat tema, bahasa, dan pemberitahuan ini di perangkatmu.")],
      [".storage-notice a", t("Cookie policy", "Kebijakan cookie")],
      [".notice-dismiss", t("Got it", "Mengerti")],
      [".contents-sidebar", t("Page contents", "Isi halaman"), "aria-label"],
      [".contents-heading", t("On this page", "Di halaman ini")],
      ["#contents-navigation", t("On this page", "Di halaman ini"), "aria-label"],
      [".back-to-top", t("Back to top ↑", "Kembali ke atas ↑")],
      ["#community-title", t("Need help or found a bug?", "Butuh bantuan atau menemukan bug?")],
      [".community-description", t("Report bugs, ask questions, and follow project updates in our Discord community.", "Laporkan bug, ajukan pertanyaan, dan ikuti kabar proyek di komunitas Discord kami.")],
      [".community-join-label", t("Join our Discord", "Gabung Discord")],
      [".community-copy .copy-label", t("Copy invite", "Salin undangan")],
      [".community-online-label", t("Online", "Daring")],
      [".community-offline-label", t("Offline", "Luring")],
      [".community-members-label", t("Members", "Anggota")],
      ["#search-title", t("Search the docs", "Cari dokumentasi")],
      [".search-dialog .round-button", t("Close search", "Tutup pencarian"), "aria-label"],
      ['label[for="doc-search"]', t("Find a method or control", "Temukan metode atau kontrol")],
      ["#doc-search", t("Try maxPick or ThemePicker", "Coba maxPick atau ThemePicker"), "placeholder"],
    ]) {
      const target = document.querySelector(selector);
      if (attribute) target.setAttribute(attribute, value);
      else target.textContent = value;
    }
    languageButton.setAttribute("aria-pressed", String(currentLanguage === "id"));
    languageButton.dataset.language = currentLanguage;
    applyTheme();
    notice.hidden = noticeDismissed;
    renderNavigation(sidebarNavigation);
    renderRoute();
    renderDiscordCounts();
    updateSearch();
  }

  languageButton.addEventListener("click", () => {
    currentLanguage = currentLanguage === "en" ? "id" : "en";
    savePreference("arod-ui-language", currentLanguage);
    render();
  });
  themeButton.addEventListener("click", () => {
    currentTheme = currentTheme === "sakura" ? "midnight" : "sakura";
    savePreference("arod-ui-theme", currentTheme);
    applyTheme();
  });
  document.querySelector(".notice-dismiss").addEventListener("click", () => {
    noticeDismissed = true;
    savePreference("arod-ui-notice", "dismissed");
    notice.hidden = true;
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "arod-ui-language" || event.key === null) {
      currentLanguage = readPreference("arod-ui-language", ["en", "id"], "en");
      render();
    }
    if (event.key === "arod-ui-theme" || event.key === null) {
      currentTheme = readPreference("arod-ui-theme", ["sakura", "midnight"], "midnight");
      applyTheme();
    }
    if (event.key === "arod-ui-notice" || event.key === null) {
      noticeDismissed = readPreference("arod-ui-notice", ["dismissed"], "") === "dismissed";
      notice.hidden = noticeDismissed;
    }
  });

  // Save each entry before replacing its article; hashchange is the fallback, without a second render.
  window.addEventListener("popstate", renderRoute);
  window.addEventListener("hashchange", renderRoute);
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (link.matches(".skip-link, .back-to-top")) {
      event.preventDefault();
      focusDestination(article.querySelector("h1"));
      return;
    }
    focusAfterNavigation = true;
    if (location.hash === link.hash) {
      event.preventDefault();
      renderRoute();
    }
  });
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
  });

  function updateSearch() {
    const terms = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    searchResults.replaceChildren();
    if (terms.length === 0) {
      searchStatus.textContent = t("Type to search pages, controls, and examples.", "Ketik untuk mencari halaman, kontrol, dan contoh.");
      return;
    }

    const matches = [];
    for (const item of pages) {
      for (const part of item.sections) {
        const copy = typeof part.code === "string" && docs[part.code] ? docs[part.code] : part.code || "";
        const tableText = part.table ? [...part.table.headers, ...part.table.rows.flat()].map(text).join(" ") : "";
        const index = [item.title, item.group, item.description, part.title, ...(part.body || []), ...(part.bullets || []), part.note || "", tableText, copy]
          .map(text).join(" ").toLowerCase();
        if (terms.every((term) => index.includes(term))) matches.push({ page: item, section: part });
      }
    }

    const shown = matches.slice(0, 12);
    for (const match of shown) {
      const row = element("li");
      const link = element("a");
      link.href = `#${match.page.id}/${match.section.id}`;
      link.dataset.searchResult = "";
      link.append(
        element("span", "search-result-title", match.section.title),
        element("span", "search-result-path", `${text(match.page.title)} · ${text(match.page.group)}`)
      );
      row.append(link);
      searchResults.append(row);
    }
    searchStatus.textContent = matches.length === 0
      ? t("No results. Try a shorter word or a control name.", "Tidak ada hasil. Coba kata lebih pendek atau nama kontrol.")
      : t(`${matches.length} ${matches.length === 1 ? "result" : "results"}.`, `${matches.length} hasil.`);
  }

  function openSearch() {
    searchDialog.removeAttribute("data-closing");
    searchDialog.showModal();
    searchInput.value = "";
    updateSearch();
    searchInput.focus();
  }
  async function closeSearch() {
    if (!searchDialog.open || searchDialog.hasAttribute("data-closing")) return;
    searchDialog.setAttribute("data-closing", "");
    await Promise.allSettled(searchDialog.getAnimations().map((animation) => animation.finished));
    if (!searchDialog.hasAttribute("data-closing")) return;
    searchDialog.close();
    searchDialog.removeAttribute("data-closing");
  }
  searchTrigger.addEventListener("click", openSearch);
  searchDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    void closeSearch();
  });
  searchDialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    void closeSearch();
  });
  searchInput.addEventListener("input", updateSearch);
  searchDialog.addEventListener("close", () => {
    searchInput.value = "";
    searchResults.replaceChildren();
    updateSearch();
  });
  searchResults.addEventListener("click", async (event) => {
    const link = event.target.closest("a[data-search-result]");
    if (!link) return;
    event.preventDefault();
    focusAfterNavigation = true;
    await closeSearch();
    if (location.hash === link.hash) renderRoute();
    else location.hash = link.hash;
  });

  function updateNavigationMode() {
    const mobile = matchMedia("(max-width: 47rem)").matches;
    navigation.classList.toggle("mobile-navigation", mobile);
    if (mobile && nativePopover) navigation.setAttribute("popover", "auto");
    else navigation.removeAttribute("popover");
    if (!mobile) {
      navigation.classList.remove("fallback-open");
    }
    const expanded = mobile
      ? nativePopover ? navigation.matches(":popover-open") : navigation.classList.contains("fallback-open")
      : !document.documentElement.classList.contains("sidebar-collapsed");
    menuButton.setAttribute("aria-expanded", String(expanded));
  }
  window.addEventListener("resize", updateNavigationMode);
  navigation.addEventListener("beforetoggle", (event) => {
    menuButton.setAttribute("aria-expanded", String(event.newState === "open"));
  });
  navigation.addEventListener("click", (event) => {
    if (!event.target.closest("a[data-page-link]")) return;
    if (nativePopover && navigation.matches(":popover-open")) navigation.hidePopover();
    navigation.classList.remove("fallback-open");
    updateNavigationMode();
  });
  menuButton.addEventListener("click", () => {
    if (!matchMedia("(max-width: 47rem)").matches) {
      document.documentElement.classList.toggle("sidebar-collapsed");
      updateNavigationMode();
    }
  });
  if (!nativePopover) {
    menuButton.addEventListener("click", () => {
      if (matchMedia("(max-width: 47rem)").matches) menuButton.setAttribute("aria-expanded", String(navigation.classList.toggle("fallback-open")));
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && navigation.classList.contains("fallback-open")) {
        navigation.classList.remove("fallback-open");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.focus();
      }
    });
  }

  function reportCopy(button, success) {
    const invite = button.getAttribute("commandfor") === "discord-invite";
    const status = button.nextElementSibling;
    clearTimeout(copyTimers.get(button));
    button.removeAttribute("data-copied");
    button.removeAttribute("data-failed");
    button.dataset[success ? "copied" : "failed"] = "";
    button.querySelector(".copy-icon use").setAttribute("href", success ? "#icon-check" : "#icon-alert");
    button.querySelector(".copy-label").textContent = success ? t("Copied", "Tersalin") : invite ? t("Select invite", "Pilih undangan") : t("Select code", "Pilih kode");
    let message = success ? invite ? t("Invite copied", "Undangan tersalin") : t("Copied", "Tersalin")
      : invite ? t("Copy failed. Invite selected for manual copying.", "Gagal menyalin. Undangan dipilih agar dapat disalin manual.")
      : t("Copy failed. Code selected for manual copying.", "Gagal menyalin. Kode dipilih agar dapat disalin manual.");
    if (message === lastCopyMessage) message += "\u00a0";
    lastCopyMessage = message;
    status.textContent = message;
    copyTimers.set(button, setTimeout(() => {
      button.removeAttribute("data-copied");
      button.removeAttribute("data-failed");
      button.querySelector(".copy-icon use").setAttribute("href", "#icon-copy");
      button.querySelector(".copy-label").textContent = invite ? t("Copy invite", "Salin undangan") : t("Copy", "Salin");
      status.textContent = "";
    }, 2200));
  }

  async function copyText(button, target) {
    if (!button || !target || !target.matches("code, a.community-invite")) return;
    try {
      await navigator.clipboard.writeText(target.matches("a") ? target.href : target.innerText.trim());
      reportCopy(button, true);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(target);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      (target.closest("pre") || target).focus({ preventScroll: true });
      reportCopy(button, false);
    }
  }

  if ("CommandEvent" in window) {
    document.addEventListener("command", (event) => {
      if (event.command === "--copy") {
        event.preventDefault();
        void copyText(event.source, event.target);
      }
    }, true);
  } else {
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      const button = event.target.closest('button[command="--copy"]');
      if (!button) return;
      const target = document.getElementById(button.getAttribute("commandfor"));
      void copyText(button, target);
    });
  }

  updateHeaderHeight();
  new ResizeObserver(updateHeaderHeight).observe(topbar);
  render();
  updateNavigationMode();
})();
