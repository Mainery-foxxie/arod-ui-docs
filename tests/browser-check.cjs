const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const cache = path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
    if (fs.existsSync(cache)) {
      for (const entry of fs.readdirSync(cache)) {
        try {
          return require(path.join(cache, entry, "node_modules", "playwright"));
        } catch {}
      }
    }
    throw new Error("Browser checks require Playwright. Install it for development or set NODE_PATH.");
  }
}

function startServer(root) {
  const mime = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(path.resolve(root) + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      response.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
  }));
}

async function main() {
  const { chromium } = loadPlaywright();
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  assert.equal(vercelConfig.outputDirectory, "public", "Vercel publishes the static site directory");
  assert.equal(fs.existsSync(path.join(__dirname, "..", vercelConfig.outputDirectory, "index.html")), true, "the Vercel output directory contains the site entry point");
  const roots = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ];
  const executablePath = roots.find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const { server, origin } = await startServer(path.join(__dirname, "..", "public"));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const discordApi = "https://discord.com/api/v10/invites/A5fmd9nBbD?with_counts=true";
  const discordFixture = { guild: { id: "1525943679133552811" }, approximate_member_count: 1324, approximate_presence_count: 76 };
  let discordPayload = discordFixture;
  let discordHttpStatus = 200;
  let discordRequests = 0;
  await page.route(discordApi, (route) => {
    discordRequests += 1;
    return route.fulfill({ status: discordHttpStatus, json: discordPayload });
  });
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Getting started" }).waitFor();

    const mainCount = await page.getByRole("main").count();
    assert.equal(mainCount, 1, "the page has one main landmark");
    assert.ok(await page.getByRole("navigation", { name: "Documentation", exact: true }).isVisible());

    const community = page.locator(".community-section");
    assert.equal(await community.isVisible(), false, "ordinary articles do not show the Discord panel");
    assert.equal(discordRequests, 0, "ordinary articles do not request Discord member counts");
    await page.locator('[data-page-link="discord-support"]').click();
    await page.getByRole("heading", { name: "Discord support", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Join our Discord", exact: true }).count(), 1, "readers can join the bug-report community");
    assert.equal(await community.locator(".community-join").getAttribute("href"), "https://discord.gg/A5fmd9nBbD", "the community action opens the supplied invite");
    await page.waitForFunction(() => document.querySelector('[data-discord-count="members"]')?.textContent === "1,324");
    assert.equal(await community.locator('[data-discord-count="online"]').innerText(), "76", "public presence counts are displayed");
    assert.equal(await community.locator('[data-discord-count="offline"]').innerText(), "1,248", "offline members exclude the online count");
    assert.equal(await community.locator(".community-icon").evaluate((image) => image.complete && image.naturalWidth > 0), true, "the verified server icon loads from the site");
    await page.locator('[data-page-link="getting-started"]').click();
    await page.getByRole("heading", { name: "Getting started", exact: true }).waitFor();
    assert.equal(await community.isVisible(), false, "leaving support removes the Discord panel from the article");

    const languageButton = page.locator(".language-toggle");
    assert.equal(await languageButton.count(), 1, "readers can switch the documentation language");
    const originalCode = await page.locator(".language-luau").first().textContent();
    assert.equal(await page.locator(".code-line-numbers").count(), 1, "the loader snippet has its own line-number gutter");
    assert.equal(await page.locator(".code-line-numbers").first().textContent(), "1", "single-line snippets start at line one");
    await languageButton.click();
    assert.equal(await page.locator("html").getAttribute("lang"), "id", "Indonesian sets the document language");
    assert.equal(await page.locator("main h1").innerText(), "Mulai di sini", "the introduction is translated");
    assert.match(await page.locator(".page-description").innerText(), /antarmuka Roblox/, "article prose is translated");
    assert.equal(await page.locator('[data-page-link="windows"]').innerText(), "Jendela", "navigation is translated");
    assert.equal(await page.locator(".language-luau").first().textContent(), originalCode, "language changes preserve Luau exactly");
    await page.locator('[data-page-link="discord-support"]').click();
    await page.getByRole("heading", { name: "Bantuan Discord", exact: true }).waitFor();
    assert.equal(await community.locator("h2").innerText(), "Butuh bantuan atau menemukan bug?", "the Discord help section is translated");
    assert.equal(await community.locator('[data-discord-count="members"]').innerText(), "1.324", "Discord counts follow Indonesian number formatting");
    assert.equal(await community.getByRole("button", { name: "Salin undangan", exact: true }).count(), 1, "invite copying is named in the selected language");
    assert.equal(discordRequests, 1, "returning to support reuses counts for this visit");
    await page.locator('[data-page-link="getting-started"]').click();
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("html").getAttribute("lang"), "id", "the language survives reload");
    await page.locator('[data-page-link="sliders"]').click();
    assert.match(await page.locator(".reference-table").innerText(), /Batas bawah/, "reference descriptions are translated");
    await languageButton.click();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("main h1").innerText(), "Getting started", "readers can return to English");

    for (const stored of ["unknown", "{broken"]) {
      await page.evaluate((value) => localStorage.setItem("arod-ui-language", value), stored);
      await page.reload({ waitUntil: "domcontentloaded" });
      assert.equal(await page.locator("html").getAttribute("lang"), "en", "invalid language storage falls back to English");
    }
    await page.evaluate(() => localStorage.removeItem("arod-ui-language"));

    assert.equal(await page.locator("html").getAttribute("data-theme"), "midnight", "Midnight is the initial docs theme");
    assert.equal(await page.locator(".brand-logo").evaluate((node) => node.complete && node.naturalWidth === 223), true, "the supplied SVG loads as the site logo");
    const themeButton = page.locator(".theme-toggle");
    await themeButton.click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "sakura", "the theme control selects Sakura");
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "light", "native controls follow the selected theme");
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "sakura", "a saved Sakura choice overrides the Midnight default");
    await themeButton.click();
    await page.evaluate(() => localStorage.setItem("arod-ui-theme", "unknown"));
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "midnight", "invalid theme storage recovers to Midnight");
    await page.evaluate(() => localStorage.removeItem("arod-ui-theme"));

    const notice = page.locator(".storage-notice");
    assert.equal(await notice.isVisible(), true, "the preference notice is available without blocking the docs");
    await page.locator('.article-footer a[href="#cookie-policy"]').click();
    await page.getByRole("heading", { name: "Cookie policy", exact: true }).waitFor();
    assert.match(await page.locator("#article").innerText(), /Google Fonts/);
    assert.match(await page.locator("#article").innerText(), /localStorage/);
    await languageButton.click();
    assert.equal(await page.locator("main h1").innerText(), "Kebijakan cookie", "the policy is translated");
    await languageButton.click();
    await page.locator(".notice-dismiss").click();
    assert.equal(await notice.isVisible(), false, "the notice can be dismissed");
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await notice.isVisible(), false, "notice dismissal survives reload");
    assert.equal(await page.evaluate(() => document.cookie), "", "the app sets no cookies");
    await page.goto(origin, { waitUntil: "domcontentloaded" });

    const showcase = page.locator(".demo-window");
    assert.equal(await showcase.count(), 1, "the introduction has a single complete showcase window");
    for (const group of ["Player", "Inputs", "Advanced", "Configs", "Theme"]) {
      assert.match(await showcase.innerText(), new RegExp(group, "i"), `the showcase includes ${group}`);
    }
    const previewGeometry = await showcase.evaluate((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, scrollable: node.querySelector(".demo-content").scrollHeight > node.querySelector(".demo-content").clientHeight }));
    assert.ok(Math.abs(previewGeometry.width - 200) <= 2 && Math.abs(previewGeometry.height - 380) <= 2, "the preview follows the live 200 by 380 window instead of a wide form");
    assert.equal(previewGeometry.scrollable, true, "the controls scroll inside the compact window");
    assert.equal(await showcase.locator(".demo-title").innerText(), "AROD UI", "the title matches the live window");
    assert.equal(await showcase.locator(".demo-title-mark use").getAttribute("href"), "#icon-shield", "the preview uses the library's shield icon");
    assert.equal(await showcase.locator("[data-demo-toggle]").getAttribute("aria-checked"), "false", "Sprint begins off as in the supplied script");
    assert.equal(await showcase.locator("#demo-speed").inputValue(), "16", "speed begins at the script's registered default");
    assert.equal(await showcase.locator("#demo-tools").isVisible(), false, "Tools starts compact until its summary is opened");
    assert.equal(await showcase.locator("#demo-configs").inputValue(), "", "the config manager starts empty until a config is created");
    assert.equal(await showcase.locator(".demo-config-list > summary").count(), 1, "the empty Configs picker can expand like the live reference");
    await showcase.locator(".demo-config-list > summary").press("Enter");
    assert.match(await showcase.locator(".demo-config-empty").innerText(), /no configs yet.*name one above.*create/is, "opening an empty Configs picker explains how to create one");
    assert.equal(await showcase.locator(".demo-config-empty").isVisible(), true, "the empty Configs guidance is visible inside the expanded picker");
    await showcase.locator(".demo-config-list > summary").press("Enter");
    assert.equal(await showcase.locator(".demo-config-empty").isVisible(), false, "the empty Configs guidance collapses again with the keyboard");
    await showcase.locator("[data-demo-load]").click();
    assert.match(await page.locator("[data-demo-status]").innerText(), /pick a config/i, "loading an empty config list gives a useful message");
    await showcase.locator("[data-demo-save]").click();
    assert.match(await page.locator("[data-demo-status]").innerText(), /pick a config/i, "saving an empty config list does not create an unnamed config");
    await showcase.locator("#demo-search").fill("configs");
    await showcase.locator(".demo-search-results button").first().click();
    assert.equal(await showcase.locator(".demo-config-list > summary").evaluate((node) => node === document.activeElement), true, "searching an empty config list focuses its expandable summary");
    await showcase.getByRole("button", { name: "Clear control search", exact: true }).click();
    assert.equal(await showcase.locator(".demo-search").evaluate((node) => {
      const input = node.querySelector("input");
      const textStart = input.getBoundingClientRect().left + parseFloat(getComputedStyle(input).paddingInlineStart);
      return textStart > node.querySelector(":scope > .demo-icon").getBoundingClientRect().right;
    }), true, "inline search text leaves room for its search icon");
    assert.deepEqual(await showcase.evaluate((node) => {
      const label = document.createRange();
      label.selectNodeContents(node.querySelector('label[for="demo-name"]').lastChild);
      const input = node.querySelector("#demo-name").getBoundingClientRect();
      return { selectedTools: node.querySelector("#demo-tools").selectedOptions.length, nameOverlaps: label.getBoundingClientRect().right > input.left };
    }), { selectedTools: 0, nameOverlaps: false }, "the compact preview keeps the name label readable and starts Tools empty");
    const showcaseBackground = await showcase.evaluate((node) => getComputedStyle(node).backgroundColor);
    await themeButton.click();
    await showcase.locator("#demo-theme").selectOption("Sakura");
    assert.equal(await showcase.evaluate((node) => getComputedStyle(node).backgroundColor), "rgb(255, 246, 250)", "Sakura changes the entire preview base to the real registered palette");
    assert.deepEqual(await showcase.locator(".demo-control").first().evaluate((node) => ({ surface: getComputedStyle(node).backgroundColor, text: getComputedStyle(node).color })), { surface: "rgb(255, 250, 252)", text: "rgb(69, 31, 49)" }, "Sakura recolors the control cards and text together");
    const contrastProblems = [];
    for (const preset of ["Rose", "Crimson", "Ocean", "Sakura"]) {
      await showcase.locator("#demo-theme").selectOption(preset);
      await showcase.getByRole("button", { name: "Close preview", exact: true }).hover();
      const ratios = await showcase.evaluate((node) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        function luminance(color) {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
            .map((value) => value / 255)
            .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
            .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        }
        function ratio(foreground, background) {
          const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
          return (lighter + 0.05) / (darker + 0.05);
        }
        const result = {};
        for (const [name, selector] of [["section", ".demo-section-title"], ["speed", ".demo-slider-value"], ["folder", ".demo-config-folder > summary"]]) {
          const style = getComputedStyle(node.querySelector(selector));
          result[name] = ratio(style.color, style.backgroundColor);
        }
        const close = node.querySelector('button[aria-label="Close preview"]');
        result.hoverIcon = ratio(getComputedStyle(close.querySelector("svg")).color, getComputedStyle(close).backgroundColor);
        const autoLoad = node.querySelector("#demo-autoload");
        autoLoad.checked = true;
        const switchStyle = getComputedStyle(autoLoad);
        const thumbColor = switchStyle.backgroundImage.match(/(?:rgba?\([^)]*\)|color\([^)]*\))/)[0];
        result.switchThumb = ratio(thumbColor, switchStyle.backgroundColor);
        autoLoad.checked = false;
        return result;
      });
      for (const [name, ratio] of Object.entries(ratios)) {
        if (ratio < (["hoverIcon", "switchThumb"].includes(name) ? 3 : 4.5)) contrastProblems.push(`${preset} ${name}: ${ratio.toFixed(2)}:1`);
      }
    }
    assert.deepEqual(contrastProblems, [], "every preview palette keeps small accent text and hovered title icons readable");
    await showcase.locator(".demo-content").evaluate((node) => { node.scrollTop = 0; });
    await page.mouse.move(0, 0);
    await showcase.screenshot({ path: path.join(require("node:os").tmpdir(), "opencode", "arod-preview-sakura.png"), animations: "disabled" });
    await showcase.locator("#demo-theme").selectOption("Rose");
    await showcase.locator(".demo-content").evaluate((node) => { node.scrollTop = 0; });
    assert.equal(await showcase.evaluate((node) => getComputedStyle(node).backgroundColor), showcaseBackground, "the product preview retains its dark palette across docs themes");
    await themeButton.click();
    await showcase.screenshot({ path: path.join(require("node:os").tmpdir(), "opencode", "arod-preview-rose.png"), animations: "disabled" });

    const navigationProblems = [];
    await page.goto(`${origin}#themes`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Themes", exact: true }).waitFor();
    await page.locator(".skip-link").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement === document.querySelector("main h1") || document.querySelector("main h1")?.textContent !== "Themes");
    if (await page.locator("main h1").innerText() !== "Themes") navigationProblems.push("skip link replaces the article");
    if (await page.evaluate(() => location.hash) !== "#themes") navigationProblems.push("skip link changes the article route");
    await page.goto(`${origin}#themes`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Themes", exact: true }).waitFor();
    await page.locator(".back-to-top").click();
    await page.waitForFunction(() => document.activeElement === document.querySelector("main h1") || document.querySelector("main h1")?.textContent !== "Themes");
    if (await page.locator("main h1").innerText() !== "Themes") navigationProblems.push("back-to-top replaces the article");
    await page.goto(`${origin}#full-example`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Full example", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const previousScroll = await page.evaluate(() => {
      window.scrollTo({ top: 475, behavior: "instant" });
      return window.scrollY;
    });
    await page.locator('[data-page-link="themes"]').click();
    await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "Themes");
    if (await page.locator("main h1").evaluate((node) => node.getBoundingClientRect().top < document.querySelector(".topbar").getBoundingClientRect().bottom)) navigationProblems.push("page navigation keeps its heading offscreen");
    if (!await page.locator("main h1").evaluate((node) => node === document.activeElement)) navigationProblems.push("page navigation does not focus its heading");
    await page.goBack();
    await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "Full example");
    await page.waitForFunction((expected) => Math.abs(window.scrollY - expected) < 2, previousScroll, { timeout: 3000 }).catch(async () => {
      navigationProblems.push(`browser Back restores scroll to ${await page.evaluate(() => window.scrollY)} instead of ${previousScroll}`);
    });
    await page.goForward();
    await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "Themes");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForFunction(() => document.querySelector("#documentation-navigation").hasAttribute("popover"));
    if (await page.locator(".menu-button").getAttribute("aria-expanded") !== "false") navigationProblems.push("desktop-to-mobile resize leaves the closed menu expanded");
    assert.deepEqual(navigationProblems, [], "navigation preserves the article and presents its destination correctly");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-section-link="sakura-theme"]').click();
    await page.waitForFunction(() => document.activeElement === document.querySelector("#sakura-theme h2"));
    assert.equal(await page.evaluate(() => location.hash), "#themes/sakura-theme", "section navigation retains its explicit route");
    await page.goto(`${origin}#themes/missing`, { waitUntil: "domcontentloaded" });
    assert.match(await page.locator('#article > .note[role="status"]').innerText(), /Showing Themes/, "missing-section feedback names the article that is actually shown");

    const reviewProblems = [];
    await page.goto(`${origin}#full-example/complete-script`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Full example", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const sectionScroll = await page.evaluate(() => {
      window.scrollTo({ top: 600, behavior: "instant" });
      return window.scrollY;
    });
    await page.locator('[data-page-link="themes"]').click();
    await page.getByRole("heading", { name: "Themes", exact: true }).waitFor();
    await page.goBack();
    await page.getByRole("heading", { name: "Full example", exact: true }).waitFor();
    await page.waitForFunction((expected) => Math.abs(scrollY - expected) < 2, sectionScroll, { timeout: 1500 }).catch(async () => reviewProblems.push(`Back restores a section route to ${await page.evaluate(() => scrollY)} instead of ${sectionScroll}`));

    await page.setViewportSize({ width: 360, height: 800 });
    await page.evaluate(() => document.documentElement.style.setProperty("font-size", "200%"));
    for (const [language, title] of [["en", "Themes"], ["id", "Tema"]]) {
      if (await page.locator("html").getAttribute("lang") !== language) await languageButton.click();
      await page.locator(".menu-button").click();
      await page.locator('[data-page-link="full-example"]').click();
      await page.locator(".menu-button").click();
      await page.locator('[data-page-link="themes"]').click();
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
      if (!await page.locator("main h1").evaluate((heading) => heading === document.activeElement && heading.getBoundingClientRect().top >= document.querySelector(".topbar").getBoundingClientRect().bottom)) reviewProblems.push(`${language}: the enlarged sticky header covers the focused heading`);
    }
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("font-size");
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard denied"); } } });
    });
    await page.goto(`${origin}#discord-support`, { waitUntil: "domcontentloaded" });
    await community.waitFor({ state: "visible" });
    for (const language of ["en", "id"]) {
      if (await page.locator("html").getAttribute("lang") !== language) await languageButton.click();
      await community.locator(".community-copy").click();
      await page.waitForFunction(() => document.querySelector(".community-copy[data-failed]"));
      if (!await community.locator(".copy-feedback").evaluate((message) => {
        const bounds = message.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth;
      })) reviewProblems.push(`${language}: the mobile invite recovery message is clipped`);
    }
    if (await page.locator("html").getAttribute("lang") !== "en") await languageButton.click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.deepEqual(reviewProblems, [], "reviewed history, enlarged-heading, and mobile recovery behavior");
    await page.goto(origin, { waitUntil: "domcontentloaded" });

    const links = page.locator("[data-page-link]");
    const count = await links.count();
    const codeByPage = new Map();
    assert.ok(count >= 12, `at least 12 API pages are available; found ${count}`);
    for (let index = 0; index < count; index += 1) {
      const title = await links.nth(index).innerText();
      await links.nth(index).click();
      await page.waitForFunction((expected) => document.querySelector("main h1")?.textContent === expected, title);
      assert.equal(await page.locator("main h1").innerText(), title, `navigation opens ${title}`);
      assert.equal(await community.isVisible(), await links.nth(index).getAttribute("data-page-link") === "discord-support", "only the support route displays Discord content");
      codeByPage.set(await links.nth(index).getAttribute("data-page-link"), await page.locator(".language-luau").allTextContents());
    }

    await languageButton.click();
    for (let index = 0; index < count; index += 1) {
      const link = links.nth(index);
      const id = await link.getAttribute("data-page-link");
      const title = await link.innerText();
      await link.click();
      await page.waitForFunction((expected) => document.querySelector("main h1")?.textContent === expected, title);
      assert.deepEqual(await page.locator(".language-luau").allTextContents(), codeByPage.get(id), `Indonesian leaves ${id} code unchanged`);
      assert.doesNotMatch(await page.locator("#article").innerText(), /\[object Object\]/, `${id} renders localized values as text`);
      assert.equal(await community.isVisible(), id === "discord-support", "support-only visibility also applies in Indonesian");
    }
    await languageButton.click();

    await page.goto(`${origin}#toggles/toggle-method`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#toggle-method").count(), 1, "deep links render section targets");
    await page.goto(`${origin}#unknown-page/missing`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("main h1").innerText(), "Getting started", "unknown routes recover to the introduction");
    await page.evaluate(() => { location.hash = "#%"; });
    await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "Getting started");

    await page.goto(`${origin}#discord-support`, { waitUntil: "domcontentloaded" });
    for (const response of [
      { payload: { ...discordFixture, guild: { id: "another-server" } }, status: 200 },
      { payload: { ...discordFixture, approximate_member_count: "1324" }, status: 200 },
      { payload: { ...discordFixture, approximate_presence_count: 2000 }, status: 200 },
      { payload: { message: "Service unavailable" }, status: 503 },
    ]) {
      discordPayload = response.payload;
      discordHttpStatus = response.status;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector(".community-counts-note")?.textContent.includes("unavailable"));
      assert.deepEqual(await community.locator("[data-discord-count]").allTextContents(), ["—", "—", "—"], "invalid or unavailable Discord data never becomes fabricated member counts");
      assert.equal(await community.locator(".community-join").getAttribute("href"), "https://discord.gg/A5fmd9nBbD", "the invite stays usable when member counts fail");
    }
    discordPayload = { ...discordFixture, approximate_member_count: 0, approximate_presence_count: 0 };
    discordHttpStatus = 200;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-discord-count="members"]')?.textContent === "0");
    assert.deepEqual(await community.locator("[data-discord-count]").allTextContents(), ["0", "0", "0"], "zero member counts remain valid");
    discordPayload = discordFixture;
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "Getting started");
    const desktop = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.equal(desktop.scroll, desktop.width, "desktop has no page-wide horizontal scrolling");
    await page.screenshot({ path: path.join(require("node:os").tmpdir(), "arod-docs-desktop.png"), fullPage: true, animations: "disabled" });

    await page.setViewportSize({ width: 360, height: 800 });
    await page.evaluate(() => document.documentElement.style.setProperty("font-size", "200%"));
    const mobile = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.equal(mobile.scroll, mobile.width, "narrow 200% text layout does not overflow the page");
    assert.deepEqual(await page.locator(".demo-window").evaluate((figure) => {
      const bounds = figure.getBoundingClientRect();
      return [...figure.querySelectorAll("button, input, select")].filter((node) => {
        if (!node.getClientRects().length) return false;
        const rect = node.getBoundingClientRect();
        return rect.left < bounds.left || rect.right > bounds.right;
      }).map((node) => node.id || node.className);
    }), [], "showcase controls stay inside their window at 200% text size");
    assert.equal(await page.locator("#demo-config-name").evaluate((node) => node.scrollHeight <= node.clientHeight + 1), true, "the empty config-name hint stays readable at 200% text size");
    await page.evaluate(() => document.documentElement.style.removeProperty("font-size"));
    await page.screenshot({ path: path.join(require("node:os").tmpdir(), "arod-docs-mobile.png"), fullPage: true, animations: "disabled" });

    assert.deepEqual(errors, [], "the site runs without uncaught JavaScript errors");
    if (!process.argv.includes("--core")) {
      const searchDialog = page.locator("#search-dialog");
      await page.keyboard.press("Control+k");
      assert.equal(await searchDialog.evaluate((node) => node.open), true, "Ctrl+K opens the search dialog");
      assert.match(await searchDialog.evaluate((node) => getComputedStyle(node).transitionProperty), /opacity/, "search has a native fade transition");
      const search = page.getByRole("searchbox", { name: "Find a method or control" });
      await search.fill("maxPick");
      assert.match(await page.locator("#search-status").innerText(), /result/i, "search reports matches");
      assert.match(await page.locator("#search-results").innerText(), /Dropdowns/, "maxPick finds dropdown documentation");
      await page.locator("[data-search-result]").first().click();
      await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "Dropdowns");
      assert.equal(await searchDialog.evaluate((node) => node.open), false, "choosing a result closes search");

      const focusWasOnHeading = await page.locator("main h1").evaluate((node) => node === document.activeElement);
      await page.keyboard.press("Control+k");
      await search.fill("");
      assert.match(await page.locator("#search-status").innerText(), /type to search/i, "empty search explains how to start");
      await search.fill("<img src=x onerror=alert(1)>");
      assert.equal(await page.locator("[data-search-result]").count(), 0, "literal HTML search input is not rendered as markup");
      assert.equal(await page.locator("#search-results img").count(), 0, "search input cannot inject an image");
      assert.match(await page.locator("#search-status").innerText(), /no results/i, "unmatched search explains the result");
      await search.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#search-dialog").open);
      assert.equal(await searchDialog.evaluate((node) => node.open), false, "Escape closes search");
      assert.equal(await page.locator("main h1").evaluate((node) => node === document.activeElement), focusWasOnHeading, "closing search restores the previous focus target");

      await languageButton.click();
      await page.keyboard.press("Control+k");
      await page.locator("#doc-search").fill("batas bawah");
      assert.match(await page.locator("#search-results").innerText(), /Slider/, "search indexes Indonesian reference prose");
      assert.match(await page.locator("#search-status").innerText(), /hasil/);
      await page.locator("#doc-search").fill("<img src=x onerror=alert(1)>");
      assert.match(await page.locator("#search-status").innerText(), /Tidak ada hasil/);
      assert.equal(await page.locator("#search-results img").count(), 0, "Indonesian search keeps hostile input inert");
      await page.locator("#doc-search").press("Escape");
      await page.waitForFunction(() => !document.querySelector("#search-dialog").open);
      await languageButton.click();

      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${origin}#quick-start/your-first-window`, { waitUntil: "domcontentloaded" });
      const numberedWindow = page.locator("#your-first-window .code-frame");
      assert.equal(await numberedWindow.locator(".code-line-numbers").textContent(), "1\n2\n3\n4\n5\n6\n7", "line numbers include the blank line in the seven-line window example");
      assert.equal(await numberedWindow.locator(".code-line-numbers").getAttribute("aria-hidden"), "true", "decorative line numbers do not interrupt screen-reader code reading");
      await page.setViewportSize({ width: 360, height: 800 });
      await numberedWindow.locator("pre").evaluate((pre) => { pre.scrollLeft = 500; });
      assert.equal(await numberedWindow.locator(".code-line-numbers").evaluate((gutter) => {
        const pre = gutter.closest("pre").getBoundingClientRect();
        const bounds = gutter.getBoundingClientRect();
        return bounds.left >= pre.left && bounds.right <= pre.right;
      }), true, "the line-number gutter stays visible when narrow code scrolls horizontally");
      const gutterClip = await numberedWindow.locator("pre").evaluate((pre) => {
        window.scrollBy(0, pre.getBoundingClientRect().top - document.querySelector(".topbar").getBoundingClientRect().bottom - 12);
        const bounds = pre.getBoundingClientRect();
        const gutter = pre.querySelector(".code-line-numbers").getBoundingClientRect();
        return { x: Math.ceil(bounds.left), y: Math.ceil(gutter.top), width: Math.floor(gutter.right) - Math.ceil(bounds.left), height: Math.floor(gutter.bottom) - Math.ceil(gutter.top) };
      });
      const visibleGutter = await page.screenshot({ clip: gutterClip, animations: "disabled" });
      await numberedWindow.locator("code").evaluate((code) => { code.style.visibility = "hidden"; });
      const gutterWithoutCode = await page.screenshot({ clip: gutterClip, animations: "disabled" });
      await numberedWindow.locator("code").evaluate((code) => { code.style.removeProperty("visibility"); });
      assert.equal(visibleGutter.equals(gutterWithoutCode), true, "scrolled code cannot show through or to the left of the line-number gutter");
      await page.setViewportSize({ width: 1440, height: 1000 });
      await numberedWindow.screenshot({ path: path.join(require("node:os").tmpdir(), "opencode", "arod-numbered-code.png"), animations: "disabled" });
      const copyButton = numberedWindow.locator(".copy-button");
      const expectedCode = await numberedWindow.locator(".language-luau").innerText();
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      await copyButton.click();
      await page.waitForFunction(() => document.querySelector("#your-first-window .copy-button[data-copied]"));
      assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n"), expectedCode.trim(), "copy preserves the code without line numbers, allowing platform line endings");
      await page.locator('[data-page-link="discord-support"]').click();
      await community.locator(".community-copy").click();
      await page.waitForFunction(() => document.querySelector(".community-copy[data-copied]"));
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "https://discord.gg/A5fmd9nBbD", "copy invite writes the complete join URL");

      await page.goto(`${origin}#quick-start/your-first-window`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => { throw new Error("Clipboard permission denied"); } },
      }));
      await page.locator(".copy-button").first().click();
      await page.waitForFunction(() => document.querySelector(".copy-feedback")?.textContent.startsWith("Copy failed"));
      assert.equal(await page.evaluate(() => getSelection()?.toString().trim() === document.querySelector(".language-luau")?.textContent.trim()), true, "failed copy selects code so it can be copied manually");
      await page.locator('[data-page-link="discord-support"]').click();
      await community.locator(".community-copy").click();
      await page.waitForFunction(() => document.querySelector(".community-copy[data-failed]"));
      assert.equal(await page.evaluate(() => getSelection()?.toString()), "discord.gg/A5fmd9nBbD", "clipboard denial selects the visible invite for manual copying");
      assert.match(await community.locator(".copy-feedback").innerText(), /invite selected/i, "failed invite copying provides visible, announced feedback");

      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      const navPopover = page.locator("#documentation-navigation");
      const menuButton = page.locator(".menu-button");
      await page.waitForFunction(() => document.querySelector("#documentation-navigation").hasAttribute("popover"));
      await menuButton.click();
      await page.waitForFunction(() => document.querySelector("#documentation-navigation").matches(":popover-open"));
      assert.equal(await menuButton.getAttribute("aria-expanded"), "true", "mobile menu announces its open state");
      await page.locator("[data-page-link='getting-started']").press("Escape");
      await page.waitForFunction(() => !document.querySelector("#documentation-navigation").matches(":popover-open"));
      assert.equal(await menuButton.getAttribute("aria-expanded"), "false", "Escape closes mobile navigation");
      assert.equal(await menuButton.evaluate((node) => node === document.activeElement), true, "closing mobile navigation restores focus");
      await menuButton.click();
      await page.locator("[data-page-link='themes']").click();
      await page.waitForFunction(() => document.querySelector("main h1")?.textContent === "Themes");
      assert.equal(await navPopover.evaluate((node) => node.matches(":popover-open")), false, "mobile navigation closes after choosing a page");

      await page.goto(origin, { waitUntil: "domcontentloaded" });
      const previewToggle = page.locator("[data-demo-toggle]");
      await previewToggle.click();
      assert.equal(await previewToggle.getAttribute("aria-checked"), "true", "preview switch updates its accessible state");
      assert.match(await page.locator("[data-demo-status]").innerText(), /on/i, "preview announces the updated switch");
      const previewSlider = page.getByRole("slider", { name: "Walk speed" });
      await previewSlider.press("ArrowRight");
      assert.equal(await page.locator("[data-demo-speed]").innerText(), "17", "preview slider responds to the keyboard");
      await page.locator("[data-demo-team]").selectOption("mint");
      assert.match(await page.locator("[data-demo-status]").innerText(), /Mint/, "preview select reports the chosen option");
      await page.locator("[data-demo-action]").click();
      assert.match(await page.locator("[data-demo-status]").innerText(), /Action 1/, "preview button responds to a click");
      await page.locator("#demo-name").fill("Explorer");
      await page.locator("#demo-name").press("Tab");
      assert.match(await page.locator("[data-demo-status]").innerText(), /Explorer/, "preview text input reports its value");
      await page.locator(".demo-keybind").click();
      await page.keyboard.press("g");
      assert.match(await page.locator(".demo-keybind").innerText(), /G/, "preview keybind accepts a replacement key");
      await page.locator(".demo-tools summary").click();
      await page.locator("#demo-tools").selectOption(["Map", "Compass", "Lantern"]);
      assert.equal(await page.locator("#demo-tools option:checked").count(), 2, "preview multi-select enforces its two-option limit");
      await page.locator(".demo-folder summary").click();
      assert.equal(await page.locator(".demo-folder").getAttribute("open"), "", "preview Advanced folder expands");
      await page.locator("#demo-config-name").fill("Evening");
      await page.locator("[data-demo-create]").click();
      assert.equal(await page.locator("#demo-configs").inputValue(), "Evening", "preview config creation selects the new config");
      await page.getByRole("button", { name: "Refresh configs", exact: true }).click();
      assert.equal(await page.locator("#demo-configs").inputValue(), "Evening", "refreshing the list preserves the selected config");
      const autoLoad = page.getByRole("switch", { name: "Auto load config", exact: true });
      await autoLoad.press("Space");
      assert.equal(await autoLoad.isChecked(), true, "the Auto load switch keeps native keyboard behavior");
      await page.emulateMedia({ forcedColors: "active" });
      await autoLoad.evaluate((node) => { node.checked = false; });
      const switchOff = await autoLoad.screenshot({ animations: "disabled" });
      await autoLoad.evaluate((node) => { node.checked = true; });
      const switchOn = await autoLoad.screenshot({ animations: "disabled" });
      assert.notDeepEqual(switchOff, switchOn, "forced colors keeps the switch's on and off states visually distinct");
      await page.emulateMedia({ forcedColors: "none" });
      await page.locator("[data-demo-save]").click();
      await page.locator("#demo-speed").fill("60");
      await page.locator("[data-demo-load]").click();
      assert.equal(await page.locator("#demo-speed").inputValue(), "17", "preview config loading restores saved control values");
      await page.locator("#demo-theme").selectOption("Ocean");
      assert.match(await page.locator("[data-demo-status]").innerText(), /Ocean/, "preview theme picker changes its own accent");
      await page.locator(".demo-folder summary").click();
      await page.locator("#demo-search").fill("zzzzzz");
      assert.match(await page.locator(".demo-search-note").innerText(), /nothing found/i, "unmatched control search gives useful feedback");
      await page.locator("#demo-search").fill("run");
      assert.doesNotMatch(await page.locator("#demo-search").evaluate((node) => (node.getAttribute("aria-describedby") || "").split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ")), /nothing found/i, "matching results replace any stale no-results description");
      const folderResult = page.locator(".demo-search-results button").filter({ hasText: "Run folder action" });
      assert.match(await folderResult.innerText(), /arod UI.*Advanced/s, "search results name the owning window and folder");
      const priorStatus = await page.locator("[data-demo-status]").innerText();
      await folderResult.click();
      assert.equal(await page.locator(".demo-folder button").evaluate((node) => node === document.activeElement), true, "choosing a result opens its folder and focuses the action");
      assert.equal(await page.locator("[data-demo-status]").innerText(), priorStatus, "finding an action does not run it");
      await page.getByRole("button", { name: "Clear control search", exact: true }).click();
      assert.equal(await page.locator("#demo-search").inputValue(), "", "the inline clear button resets the search input");
      assert.equal(await page.locator(".demo-search-results button").count(), 0, "clearing search removes stale results");
      assert.match(await page.locator(".demo-search-note").innerText(), /type to search/i, "empty search shows the reference hint");
      await page.locator("#demo-search").fill("walk");
      assert.match(await page.locator(".demo-search-results").innerText(), /Walk speed/, "preview search finds a control inside its one window");
      await page.locator(".demo-search-results button").first().click();
      assert.equal(await page.locator("#demo-speed").evaluate((node) => node === document.activeElement), true, "preview search focuses its selected control");
      await page.getByRole("button", { name: "Collapse preview", exact: true }).click();
      assert.equal(await page.locator("#demo-controls").isVisible(), false, "the single preview can collapse");
      await page.getByRole("button", { name: "Expand preview", exact: true }).click();
      assert.equal(await page.locator("#demo-controls").isVisible(), true, "the collapsed preview can reopen");
      await page.getByRole("button", { name: "Close preview", exact: true }).click();
      assert.equal(await showcase.isVisible(), false, "the close action dismisses the preview window");
      await page.getByRole("button", { name: "Show preview", exact: true }).click();
      assert.equal(await showcase.isVisible(), true, "readers can restore the single dismissed preview");

      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.keyboard.press("Control+k");
      assert.ok(await searchDialog.evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration) <= 0.1), "reduced motion shortens search transitions");
      await page.locator("#doc-search").press("Escape");
      await page.waitForFunction(() => !document.querySelector("#search-dialog").open);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await languageButton.click();
      await page.screenshot({ path: path.join(require("node:os").tmpdir(), "arod-docs-midnight-id.png"), fullPage: true, animations: "disabled" });
      await page.locator('[data-page-link="discord-support"]').click();
      await community.screenshot({ path: path.join(require("node:os").tmpdir(), "opencode", "arod-community-desktop-id.png"), animations: "disabled" });
      await languageButton.click();
      await community.screenshot({ path: path.join(require("node:os").tmpdir(), "opencode", "arod-community-desktop.png"), animations: "disabled" });
      await page.setViewportSize({ width: 360, height: 800 });
      await community.screenshot({ path: path.join(require("node:os").tmpdir(), "opencode", "arod-community-mobile.png"), animations: "disabled" });

      const blockedContext = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: "light" });
      await blockedContext.addInitScript(() => {
        Object.defineProperty(Storage.prototype, "getItem", { value() { throw new DOMException("Storage blocked", "SecurityError"); } });
        Object.defineProperty(Storage.prototype, "setItem", { value() { throw new DOMException("Storage blocked", "SecurityError"); } });
        delete HTMLElement.prototype.popover;
        delete window.CommandEvent;
      });
      const blockedPage = await blockedContext.newPage();
      blockedPage.on("pageerror", (error) => errors.push(error.message));
      await blockedPage.route("https://fonts.googleapis.com/**", (route) => route.abort());
      await blockedPage.route(discordApi, (route) => route.abort());
      await blockedPage.goto(origin, { waitUntil: "domcontentloaded" });
      assert.equal(await blockedPage.locator("html").getAttribute("data-theme"), "midnight", "Midnight remains the explicit default even with a light OS and blocked storage");
      await blockedPage.locator(".theme-toggle").click();
      await blockedPage.locator(".language-toggle").click();
      assert.equal(await blockedPage.locator("html").getAttribute("data-theme"), "sakura", "theme switching works with storage blocked");
      assert.equal(await blockedPage.locator("main h1").innerText(), "Mulai di sini", "translation works with storage and fonts blocked");
      assert.equal(await blockedPage.locator(".community-section").isVisible(), false, "ordinary pages also omit Discord when optional services are blocked");
      await blockedPage.goto(`${origin}#discord-support`, { waitUntil: "domcontentloaded" });
      await blockedPage.locator(".community-section").waitFor({ state: "visible" });
      await blockedPage.waitForFunction(() => document.querySelector(".community-counts-note")?.textContent.includes("tidak tersedia"));
      assert.equal(await blockedPage.locator(".community-join").getAttribute("href"), "https://discord.gg/A5fmd9nBbD", "Discord remains reachable when its API and other optional services are blocked");
      await blockedPage.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("Clipboard denied"); } } }));
      await blockedPage.locator(".community-copy").click();
      await blockedPage.waitForFunction(() => document.querySelector(".community-copy[data-failed]"));
      assert.equal(await blockedPage.evaluate(() => getSelection()?.toString()), "discord.gg/A5fmd9nBbD", "the copy-command fallback supports manual invite copying");
      await blockedPage.locator(".notice-dismiss").click();
      assert.equal(await blockedPage.locator(".storage-notice").isVisible(), false, "notice dismissal works without persistence");
      await blockedPage.locator(".menu-button").click();
      assert.equal(await blockedPage.locator("#documentation-navigation").isVisible(), true, "the menu works without native popover support");
      await blockedPage.locator('[data-page-link="themes"]').click();
      await blockedPage.waitForFunction(() => document.querySelector("main h1")?.textContent === "Tema");
      assert.equal(await blockedPage.locator(".menu-button").getAttribute("aria-expanded"), "false", "choosing a page closes the fallback menu's accessible state");
      assert.equal(await blockedPage.locator("main h1").evaluate((node) => node === document.activeElement), true, "fallback navigation focuses the destination");
      await blockedPage.locator(".menu-button").click();
      await blockedPage.keyboard.press("Escape");
      await blockedPage.locator("#documentation-navigation").waitFor({ state: "hidden" });
      assert.equal(await blockedPage.locator("#documentation-navigation").isVisible(), false, "Escape closes the navigation fallback");
      await blockedContext.close();

      assert.deepEqual(errors, [], "interactions run without uncaught JavaScript errors");

      const localPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const localErrors = [];
      localPage.on("pageerror", (error) => localErrors.push(error.message));
      await localPage.route(discordApi, (route) => route.abort());
      await localPage.goto(pathToFileURL(path.join(__dirname, "..", "public", "index.html")).href, { waitUntil: "domcontentloaded" });
      await localPage.getByRole("heading", { name: "Getting started" }).waitFor();
      assert.ok(await localPage.locator("[data-page-link]").count() >= 16, "the documentation scripts also load from local files");
      assert.equal(await localPage.locator(".brand-logo").evaluate((node) => node.complete && node.naturalWidth === 223 && parseFloat(getComputedStyle(node).width) < 40), true, "the relative logo and stylesheet load locally");
      await localPage.locator(".language-toggle").click();
      assert.equal(await localPage.locator("main h1").innerText(), "Mulai di sini", "local-file language switching works");
      await localPage.locator(".theme-toggle").click();
      assert.equal(await localPage.locator("html").getAttribute("data-theme"), "sakura", "local-file theme switching works");
      await localPage.locator(".language-toggle").click();
      await localPage.goto(`${pathToFileURL(path.join(__dirname, "..", "public", "index.html")).href}#full-example/complete-script`, { waitUntil: "domcontentloaded" });
      await localPage.reload({ waitUntil: "domcontentloaded" });
      await localPage.getByRole("heading", { name: "Full example", exact: true }).waitFor();
      await localPage.evaluate(() => document.fonts.ready);
      const localScroll = await localPage.evaluate(() => { window.scrollTo({ top: 600, behavior: "instant" }); return scrollY; });
      await localPage.locator('[data-page-link="themes"]').click();
      await localPage.getByRole("heading", { name: "Themes", exact: true }).waitFor();
      await localPage.goBack();
      await localPage.getByRole("heading", { name: "Full example", exact: true }).waitFor();
      await localPage.waitForFunction((expected) => Math.abs(scrollY - expected) < 2, localScroll, { timeout: 3000 });
      assert.deepEqual(localErrors, [], "local-file navigation runs without uncaught JavaScript errors");
      await localPage.close();
    }
    console.log(`Browser checks passed: ${count} bilingual pages, unchanged Luau, themes, policy, routes, responsive layout,${process.argv.includes("--core") ? "" : " search, clipboard, navigation, showcase, blocked-storage and local-file fallbacks,"} console.`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
