    const GITHUB_OWNER = "SimBeSim";
    const GITHUB_REPO = "klussenmetliefde";
    const GITHUB_BRANCH = "main";

    /* ================== CONFIG ================== */
    const TRACK_URL = "https://script.google.com/macros/s/AKfycbx7DBIjkcidyuLFWdzH0Cs859jvzCfrvqWRFa00YaiXilj4H2-7vc8EpMu0rxJFI1DAXg/exec";
    const DATA_URL = "data.json"; // optioneel; als niet gevonden, gebruiken we demo data

    /* ================== IDs & GLOBALS ================== */
    const SID = sessionStorage.sid || (sessionStorage.sid = crypto.randomUUID());
    const VID = localStorage.vid || (localStorage.vid = crypto.randomUUID());

    // ------- IP caching (in-memory + sessionStorage) -------
    let CLIENT_IP = sessionStorage.getItem("client_ip") || null;
    async function getIP() {
        if (CLIENT_IP)
            return CLIENT_IP;
        try {
            const r = await fetch("https://api64.ipify.org?format=json");
            const j = await r.json();
            CLIENT_IP = j.ip || "";
            sessionStorage.setItem("client_ip", CLIENT_IP);
        } catch {
            CLIENT_IP = "";
        }
        return CLIENT_IP;
    }
    getIP(); // fire-and-forget

    /* ================== LIGHTWEIGHT TRACKER ================== */
    // ================== LIGHTWEIGHT TRACKER (gerepareerd voor CORB) ==================
function sendBeaconSafe(payload){
  try{
    if(!navigator.sendBeacon) return false;
    const blob = new Blob([JSON.stringify(payload)], {type:"text/plain"});
    return navigator.sendBeacon(TRACK_URL, blob);
  }catch{ return false; }
}

// fetchNoCors: maak het echt "fire-and-forget" en voorkom preflight.
// Belangrijk: geen headers zetten in mode:'no-cors' en NIET proberen response te lezen.
function fetchNoCors(payload){
  try{
    // Gebruik body direct; zet géén headers (dat voorkomt CORS preflight).
    fetch(TRACK_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload)
    }).catch(()=>{/* swallow errors */});
  }catch{}
}

// pixelPing: image ping, base64 -> encodeURIComponent(btoa(...))
// Vereenvoudigd en veiliger dan unescape/encodeURIComponent combinatie.
function pixelPing(payload){
  try{
    // use plain base64 of UTF-8-safe approach:
    const json = JSON.stringify(payload);
    // btoa werkt op een byte-string; voor veilig UTF-8:
    function utf8_to_b64(str) {
      return btoa(unescape(encodeURIComponent(str)));
    }
    const q = encodeURIComponent(utf8_to_b64(json));
    const img = new Image();
    img.src = `${TRACK_URL}?p=${q}&_=${Date.now()}`;
    // keep reference briefly to increase chance of delivery
    window.__sammy_pixel = img;
  }catch{}
}

// master send: probeer beacon -> image -> fetch (in die volgorde)
function send(payload){
  try{
    if (sendBeaconSafe(payload)) return;
    // beacon failed -> eerst pixel (werkt in meeste situaties)
    pixelPing(payload);
    // en alsnog een fire-and-forget fetchNoCors als extra poging
    fetchNoCors(payload);
  }catch{}
}

    function track(event, extra = {}) {
        const data = {
            event,
            ts: new Date().toISOString(),
            path: location.pathname + location.search,
            ref: document.referrer || "",
            ua: navigator.userAgent,
            vp: `${innerWidth}x${innerHeight}`,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
            sid: SID,
            vid: VID,
            ip: CLIENT_IP || "",
            ...extra
        };
        send(data);
    }

    /* ================== YOUTUBE SEGMENTS ================== */
    // IFrame API loader
    let ytAPIReady = false, ytPlayer = null, ytOnReadyQueue = [];
    function onYouTubeIframeAPIReady() {
        ytAPIReady = true;
        ytOnReadyQueue.forEach(fn => fn());
        ytOnReadyQueue = [];
    }
    (function loadYT() {
        const s = document.createElement('script');
        s.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(s);
    })();

    function ensureYTPlayer(onReady) {
        if (ytPlayer) {
            onReady();
            return;
        }
        const fn = () => {
            const el = document.getElementById("ytplayer");
            ytPlayer = new YT.Player(el, {
                height: "390",
                width: "640",
                events: {
                    onReady: () => onReady()
                },
                playerVars: {
                    rel: 0,
                    modestbranding: 1,
                    controls: 1
                }
            });
        };
        if (ytAPIReady)
            fn();
        else
            ytOnReadyQueue.push(fn);
    }

    function playSegment(videoId, startSec, durationSec, onDone) {
        ensureYTPlayer(() => {
            const endSec = startSec + durationSec;
            ytPlayer.loadVideoById({
                videoId,
                startSeconds: startSec,
                endSeconds: endSec,
                suggestedQuality: "hd720"
            });
            const check = setInterval(() => {
                const t = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
                if (t >= endSec - 0.2) {
                    clearInterval(check);
                    ytPlayer.pauseVideo && ytPlayer.pauseVideo();
                    onDone && onDone();
                }
            }, 200);
        });
    }

    /* ================== CONTENT RENDER ENGINE ================== */
    // Slides-structuur: [{title, frames:[{type:"text"|"html"|"youtube", content/html/video...}]}]
    let SLIDES = []; // wordt gevuld via fetch(DATA_URL) of fallback demo
    let META = {}; // globale meta (document title, heading, project, ...)

    const elText = () => document.getElementById('text');
    const elHTML = () => document.getElementById('htmlbox');
    const elYTBox = () => document.getElementById('ytbox');
    const elDots = () => document.getElementById('progress');
    const elPrev = () => document.getElementById('prev');
    const elNext = () => document.getElementById('next');
    const elTitle = () => document.getElementById('title');

    let slideIdx = 0, frameIdx = 0;
    let typing = false, typerCancel = null;
    let frameStartTS = null, currentFrame = null;

    // dots
    function renderDots(n) {
        const p = elDots();
        p.innerHTML = "";
        for (let i = 0; i < n; i++) {
            const d = document.createElement('div');
            d.className = 'dot';
            p.appendChild(d);
        }
    }
    function setDotsActive(i) {
        const dots = elDots().children;
        for (let k = 0; k < dots.length; k++) {
            dots[k].classList.toggle('is-active', k === i);
            dots[k].classList.toggle('is-done', k < i);
        }
    }

    // typewriter for text frames + autofit
    function tokenize(sentence) {
        const tokens = [];
        sentence.split(/(\s+)/).forEach(part => {
            if (part === '')
                return;
            if (/\S/.test(part) && part.length > 18) {
                const mid = Math.floor(part.length / 2);
                part = part.slice(0, mid) + '\u00AD' + part.slice(mid);
            }
            tokens.push(part);
        });
        return tokens;
    }
    function autoFit(container) {
        // reduce font-size until content pasts within stage
        const target = document.querySelector('.stage');
        const el = container;
        let size = parseFloat(getComputedStyle(el).fontSize) || 28;
        let tries = 0;
        while (tries < 20 && el.scrollHeight > target.clientHeight) {
            size -= 1;
            tries += 1;
            el.style.fontSize = size + "px";
        }
    }
    function typeText(sentence, onDone) {
        typing = true;
        elPrev().disabled = true;
        elNext().disabled = true;
        const box = elText();
        box.innerHTML = '';
        box.style.display = 'block';
        elHTML().style.display = 'none';
        elYTBox().style.display = 'none';

        const tokens = tokenize(sentence);
        let i = 0,
        canceled = false;
        typerCancel = () => {
            canceled = true;
        };
        function step() {
            if (canceled)
                return;
            const span = document.createElement('span');
            span.textContent = tokens[i];
            box.appendChild(span);
            i++;
            if (i < tokens.length) {
                const delay = (/\s/.test(tokens[i - 1])) ? 10 : 28;
                console.log(delay * 20);
                setTimeout(step, 110);
            } else {
                // finished
                autoFit(box);
                typing = false;
                elPrev().disabled = (slideIdx === 0 && frameIdx === 0);
                elNext().disabled = false;
                track("frame_ready", {
                    frame: frameKey()
                });
                onDone && onDone();
            }
        }
        step();
    }

    // HTML frame render
    function renderHTML(html) {
        const box = elHTML();
        box.style.display = 'block';
        elText().style.display = 'none';
        elYTBox().style.display = 'none';
        box.innerHTML = html;
        autoFit(box);
        elPrev().disabled = (slideIdx === 0 && frameIdx === 0);
        elNext().disabled = false;
        track("frame_ready", {
            frame: frameKey()
        });
    }

    // YouTube frame render
    function renderYT({
        video,
        start = 0,
        dur = 25,
        autoadvance = true,
        text = ""
    }) {
        elYTBox().style.display = 'block';
        elText().style.display = 'none';
        elHTML().style.display = 'none';

        // optioneel begeleidende tekst boven video
        if (text) {
            elHTML().style.display = 'block';
            elHTML().innerHTML = `<div class="text">${text}</div>`;
        }

        playSegment(video, start, dur, () => {
            track("yt_segment_done", {
                frame: frameKey(),
                video,
                start,
                dur
            });
            if (autoadvance)
                nextFrame();
            else {
                elPrev().disabled = false;
                elNext().disabled = false;
            }
        });
        track("frame_ready", {
            frame: frameKey(),
            video,
            start,
            dur
        });
    }

    function frameKey() {
        return `${slideIdx}:${frameIdx}`;
    }

    function frameStart() {
        if (currentFrame != null && frameStartTS != null) {
            const ms = performance.now() - frameStartTS;
            track("frame_dwell", {
                frame: currentFrame,
                dur_ms: Math.round(ms)
            });
        }
        currentFrame = frameKey();
        frameStartTS = performance.now();
        track("frame_start", {
            frame: currentFrame
        });
    }
    function showFrame() {
        // veilige guard: check of slide en frames bestaan
        const slide = SLIDES[slideIdx];
        if (!slide || !Array.isArray(slide.frames) || slide.frames.length === 0) {
            console.warn(`showFrame: geen geldige slide gevonden op index ${slideIdx}. SLIDES.length=${SLIDES.length}`);
            return;
        }

        const f = slide.frames[frameIdx];

        setDotsActive(frameIdx);
        frameStart();

        if (f.type === "text") {
            typeText(f.content, null);
        } else if (f.type === "html") {
            renderHTML(f.html);
        } else if (f.type === "youtube") {
            renderYT(f);
        } else {
            renderHTML(`<div class="text">[Onbekend frame type: ${f.type}]</div>`);
        }
        elTitle().textContent = slide.title || `▶ ${slideIdx + 1}`;
    }

    function nextFrame() {
        if (typing && typerCancel) {
            typerCancel();
            typing = false;
        }
        const slide = SLIDES[slideIdx];
        if (frameIdx < slide.frames.length - 1) {
            const to = frameIdx + 1;
            track("nav", {
                action: "next",
                from: frameIdx,
                to
            });
            frameIdx = to;
            showFrame();
        } else {
            // naar volgende slide of klaar
            if (slideIdx < SLIDES.length - 1) {
                slideIdx++;
                frameIdx = 0;
                renderDots(SLIDES[slideIdx].frames.length);
                track("nav", {
                    action: "next_slide",
                    from: "s" + (slideIdx - 1),
                    to: "s" + slideIdx
                });
                showFrame();
            } else {
                renderHTML(`<div class="text">Einde. ❤️</div>`);
                elNext().disabled = true;
            }
        }
    }
    function prevFrame() {
        if (typing && typerCancel) {
            typerCancel();
            typing = false;
        }
        if (frameIdx > 0) {
            const to = frameIdx - 1;
            track("nav", {
                action: "prev",
                from: frameIdx,
                to
            });
            frameIdx = to;
            showFrame();
        } else if (slideIdx > 0) {
            slideIdx--;
            frameIdx = SLIDES[slideIdx].frames.length - 1;
            renderDots(SLIDES[slideIdx].frames.length);
            track("nav", {
                action: "prev_slide",
                from: "s" + (slideIdx + 1),
                to: "s" + slideIdx
            });
            showFrame();
        }
    }

    // ================= loader voor pages/{uid}.json =================
    //const GITHUB_OWNER = "SimBeSim";   // <--- vul in
    //const GITHUB_REPO  = "klussenmetliefde";     // <--- vul in
    //const GITHUB_BRANCH = "main";              // <--- vul in (of andere branch)

    /**
     * Retourneert uid uit URL: ?uid=Samanta
     * fallback: "Samanta"
     */
    function getUidFromUrl() {
        try {
            const url = new URL(location.href);
            return url.searchParams.get('uid') || url.searchParams.get('q') || 'Samanta';
        } catch (e) {
            return 'Samanta';
        }
    }

    /**
     * Laad pages/{uid}.json van raw.githubusercontent.com
     * en zet globals META, SLIDES zodat je bestaande renderer verder kan.
     */
    // Helper: probeert een URL en retourneert JSON of null
    async function tryFetchJson(url) {
        try {
            const r = await fetch(url, {
                cache: 'no-store'
            });
            console.info('tryFetchJson:', url, 'status=', r.status);
            if (!r.ok)
                return null;
            const j = await r.json();
            return j;
        } catch (e) {
            console.warn('tryFetchJson error for', url, e);
            return null;
        }
    }

    /**
     * Robuuste loader: probeert meerdere paden/branches.
     */
    async function loadPageJsonAndStart() {
        const uid = getUidFromUrl();
        console.info('Robuste loader: uid=', uid);

        const branches = [GITHUB_BRANCH || 'main', 'master'];
        const pathVariants = [
            `pages/${encodeURIComponent(uid)}.json`, 
            `${encodeURIComponent(uid)}.json`, 
            `pages/${encodeURIComponent(uid)}_short.json`, 
`pages/${encodeURIComponent(uid)}/index.json`
        ];

        let found = null;
        let tried = [];

        for (const branch of branches) {
            for (const p of pathVariants) {
                const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${branch}/${p}`;
                tried.push(url);
                const j = await tryFetchJson(url);
                if (j) {
                    const page = j.slides ? j : (j.data && j.data.slides ? j.data : null);
                    if (page && Array.isArray(page.slides) && page.slides.length > 0) {
                        found = {
                            json: j,
                            url,
                            branch,
                            path: p
                        };
                        break;
                    }
                }
            }
            if (found)
                break;
        }

        if (!found) {
            console.warn('Robuuste loader: geen geldige JSON gevonden. Tried URLs:', tried.slice(0, 50));
            const el = document.getElementById('htmlbox') || document.getElementById('frame') || document.body;
            if (el) {
                el.innerHTML = `<div class="text">Kon content niet vinden voor "<strong>${uid}</strong>". Controleer repo/branch/uid (zie console voor probelijst).</div>`;
            }
            return;
        }

        const rawJson = found.json;
        const page = rawJson.slides ? rawJson : (rawJson.data ? rawJson.data : rawJson);

        console.info('Robuuste loader: gevonden URL=', found.url, 'branch=', found.branch, 'path=', found.path);

        // Zet globals
        META = page.meta || {};
        SLIDES = page.slides;

        // UI
        if (META.pageTitle)
            document.title = META.pageTitle;
        const titleEl = document.getElementById('title');
        if (titleEl && META.heading)
            titleEl.textContent = META.heading;

        // renderDots + reset + showFrame
        if (typeof renderDots === 'function') {
            renderDots(SLIDES[0] ? SLIDES[0].frames.length : 0);
        }
        slideIdx = 0;
        frameIdx = 0;
        if (typeof showFrame === 'function')
            showFrame();
        if (typeof track === 'function')
            track('page_load', {
                uid,
                slides: SLIDES.length,
                source_url: found.url
            });
    }

    // ===== BOOT =====
    addEventListener("DOMContentLoaded", async() => {
        document.getElementById('prev').addEventListener('click', prevFrame);
        document.getElementById('next').addEventListener('click', nextFrame);

        //await loadPageJsonAndStart();

        // Safety: als er nog steeds niets is, gebruik demo
        if (!Array.isArray(SLIDES) || SLIDES.length === 0 || !SLIDES[0].frames?.length) {
            SLIDES = [{
                    title: "Fallback – tekst",
                    frames: [{
                            type: "text",
                            content: "Fallback frame. Als je dit ziet, werkt de speler; check data.json pad/inhoud."
                        }
                    ]
                }
            ];
        }

        renderDots(SLIDES[0].frames.length);
        showFrame(); // start!
        track("session_start");
    });
