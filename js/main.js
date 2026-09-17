/* ======================================================
   CloudWithDavid — JavaScript
   ====================================================== */

(function () {
    'use strict';

    // ===========================
    // DOM References
    // ===========================
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

    const navbar = $('#navbar');
    const navToggle = $('#navToggle');
    const navLinks = $('#navLinks');
    const navAnchors = $$('.nav-links a');
    const sections = $$('.page-section[id]');
    const themeToggles = $$('[data-theme-toggle]');
    const themeToggleIcons = $$('[data-theme-toggle-icon]');
    const scrollProgress = $('#scrollProgress');
    const contactForm = $('#contactForm');
    const THEME_STORAGE_KEY = 'cwd-theme';
    const SKILLS_SPOTLIGHT_CLASS = 'skills-card--spotlight';
    const SKILLS_SPOTLIGHT_DURATION = 2800;
    const skillsSpotlightTimers = new WeakMap();
    const viewportHandlers = { scroll: [], resize: [] };

    function registerViewportHandler(handler, { scroll = false, resize = false, run = false } = {}) {
        if (scroll) viewportHandlers.scroll.push(handler);
        if (resize) viewportHandlers.resize.push(handler);
        if (run) handler();
    }

    Object.entries(viewportHandlers).forEach(([event, handlers]) => {
        let frameQueued = false;
        window.addEventListener(event, () => {
            if (frameQueued) return;
            frameQueued = true;
            requestAnimationFrame(() => {
                frameQueued = false;
                handlers.forEach(handler => handler());
            });
        }, { passive: true });
    });

    // ===========================
    // 1. Theme Toggle (Dark/Light)
    // ===========================
    const systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');

    function getThemePreviewOverride() {
        const theme = new URLSearchParams(window.location.search).get('theme');
        return theme === 'dark' || theme === 'light' ? theme : '';
    }

    function getStoredTheme() {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return stored === 'dark' || stored === 'light' ? stored : '';
    }

    function getSystemTheme() {
        return systemThemeMedia.matches ? 'dark' : 'light';
    }

    function updateThemeControlState(theme) {
        const nextThemeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
        themeToggles.forEach(toggle => {
            toggle.setAttribute('aria-label', nextThemeLabel);
            toggle.setAttribute('title', nextThemeLabel);
        });

        themeToggleIcons.forEach(icon => {
            const showsDarkModeSymbol = theme === 'light';
            icon.classList.toggle('fa-moon', showsDarkModeSymbol);
            icon.classList.toggle('fa-sun', !showsDarkModeSymbol);
        });
    }

    function applyTheme(theme, { persist = true } = {}) {
        const nextTheme = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        document.documentElement.style.colorScheme = nextTheme;
        updateThemeControlState(nextTheme);
        if (persist) {
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        }
    }

    function initTheme() {
        applyTheme(getThemePreviewOverride() || getStoredTheme() || getSystemTheme(), { persist: false });
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || getSystemTheme();
        applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    themeToggles.forEach(toggle => toggle.addEventListener('click', toggleTheme));

    const syncWithSystemTheme = (event) => {
        if (getThemePreviewOverride()) return;
        if (getStoredTheme()) return;
        applyTheme(event.matches ? 'dark' : 'light', { persist: false });
    };

    if (typeof systemThemeMedia.addEventListener === 'function') {
        systemThemeMedia.addEventListener('change', syncWithSystemTheme);
    } else if (typeof systemThemeMedia.addListener === 'function') {
        systemThemeMedia.addListener(syncWithSystemTheme);
    }

    initTheme();

    const POSITIONING_LINE_WIDTH_RATIO = 0.99;

    function fitSingleLineToReferenceWidth(reference, line, widthProperty, fontSizeProperty, widthRatio) {
        const referenceWidth = reference.getBoundingClientRect().width * widthRatio;
        if (!referenceWidth) return;

        line.style.setProperty(widthProperty, `${referenceWidth}px`);
        line.style.removeProperty(fontSizeProperty);

        const textRange = document.createRange();
        textRange.selectNodeContents(line);
        const naturalLineWidth = textRange.getBoundingClientRect().width;
        const baseFontSize = parseFloat(window.getComputedStyle(line).fontSize);
        if (naturalLineWidth > referenceWidth && baseFontSize) {
            line.style.setProperty(fontSizeProperty, `${baseFontSize * (referenceWidth / naturalLineWidth)}px`);
        }
    }

    // ===========================
    // 1b. Hero Subtitle Width
    // ===========================
    function initHeroSubtitleWidth() {
        const heroTitleText = $('.hero-title > span');
        const heroSubtitle = $('.hero-subtitle');
        if (!heroTitleText || !heroSubtitle) return;

        function syncWidth() {
            fitSingleLineToReferenceWidth(
                heroTitleText,
                heroSubtitle,
                '--hero-title-width',
                '--hero-subtitle-font-size',
                POSITIONING_LINE_WIDTH_RATIO
            );
        }

        registerViewportHandler(syncWidth, { resize: true, run: true });
        document.fonts?.ready.then(syncWidth);
    }

    initHeroSubtitleWidth();

    // ===========================
    // 1c. Footer Positioning Width
    // ===========================
    function initFooterPositioningWidth() {
        const footerBrandText = $('.footer-brand .brand-text');
        const footerPositioning = $('.footer-positioning');
        const footerPositioningText = $('.footer-positioning-text');
        if (!footerBrandText || !footerPositioning || !footerPositioningText) return;

        function syncWidth() {
            const width = footerBrandText.getBoundingClientRect().width * POSITIONING_LINE_WIDTH_RATIO;
            if (!width) return;
            footerPositioning.style.setProperty('--footer-brand-text-width', `${width}px`);
            // Measure at the browser's actual font size, including any minimum-font setting.
            footerPositioning.style.removeProperty('--footer-positioning-scale');
            const textWidth = footerPositioningText.getBoundingClientRect().width;
            if (textWidth) {
                footerPositioning.style.setProperty('--footer-positioning-scale', Math.min(1, width / textWidth));
            }
        }

        registerViewportHandler(syncWidth, { resize: true, run: true });
        document.fonts?.ready.then(syncWidth);
    }

    initFooterPositioningWidth();

    // ===========================
    // 2. Mobile Navigation
    // ===========================
    function setMobileMenuOpen(isOpen) {
        if (!navLinks || !navToggle) return;
        navLinks.classList.toggle('active', isOpen);
        navToggle.classList.toggle('active', isOpen);
        navToggle.setAttribute('aria-expanded', String(isOpen));
    }

    function closeMobileMenu() {
        setMobileMenuOpen(false);
    }

    if (navToggle) {
        navToggle.addEventListener('click', () => {
            setMobileMenuOpen(!navLinks.classList.contains('active'));
        });
    }

    // Close on link click
    navAnchors.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!navLinks || !navLinks.classList.contains('active')) return;
        if (!navLinks.contains(e.target) && !navToggle.contains(e.target)) {
            closeMobileMenu();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMobileMenu();
    });

    // ===========================
    // 3. Navbar Scroll Effects
    // ===========================
    function updateScrollState() {
        const scrollY = window.pageYOffset;

        // Navbar shadow
        if (navbar) {
            navbar.classList.toggle('scrolled', scrollY > 50);
        }

        // Scroll progress bar
        if (scrollProgress) {
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0
                ? Math.min(1, Math.max(0, scrollY / docHeight))
                : 0;
            scrollProgress.style.transform = `scaleX(${progress})`;
        }

    }

    registerViewportHandler(updateScrollState, { scroll: true, resize: true, run: true });

    // ===========================
    // 3c. Contact Link Scroll Activation (Mobile + Tablet)
    // ===========================
    function initContactLinkScrollActivation() {
        const contactLinks = $$('.contact-link');
        if (!contactLinks.length) return;

        const MOBILE_TABLET_MAX_WIDTH = 1024;
        const ACTIVE_BAND_CENTER_RATIO = 0.55;
        const ACTIVE_BAND_HALF_HEIGHT_RATIO = 0.06;
        const ACTIVE_BAND_MIN_HALF_HEIGHT = 32;
        const ACTIVE_BAND_MAX_HALF_HEIGHT = 50;

        function getActiveBand() {
            if (window.innerWidth > MOBILE_TABLET_MAX_WIDTH) return null;

            const center = window.innerHeight * ACTIVE_BAND_CENTER_RATIO;
            const halfHeight = Math.min(
                ACTIVE_BAND_MAX_HALF_HEIGHT,
                Math.max(ACTIVE_BAND_MIN_HALF_HEIGHT, window.innerHeight * ACTIVE_BAND_HALF_HEIGHT_RATIO)
            );
            return { topPx: center - halfHeight, bottomPx: center + halfHeight };
        }

        function update() {
            const activeBand = getActiveBand();

            contactLinks.forEach((link) => {
                if (!activeBand) {
                    link.classList.remove('contact-link--scroll-active');
                    return;
                }

                const rect = link.getBoundingClientRect();
                const shouldActivate =
                    rect.bottom > activeBand.topPx &&
                    rect.top < activeBand.bottomPx;

                link.classList.toggle('contact-link--scroll-active', shouldActivate);
            });
        }

        registerViewportHandler(update, { scroll: true, resize: true, run: true });
    }

    initContactLinkScrollActivation();

    // ===========================
    // 4. Active Nav Link Tracking
    // ===========================
    const ACTIVE_NAV_SCROLL_OFFSET = 24;

    function updateActiveNav() {
        const navHeight = navbar ? navbar.offsetHeight : 72;
        const scrollY = window.pageYOffset + navHeight + ACTIVE_NAV_SCROLL_OFFSET;

        let currentId = '';

        sections.forEach(section => {
            const top = section.getBoundingClientRect().top + window.pageYOffset;
            if (scrollY >= top) {
                currentId = section.id;
            }
        });

        navAnchors.forEach(link => {
            const href = link.getAttribute('href');
            link.classList.toggle('active', href === `#${currentId}`);
        });
    }

    registerViewportHandler(updateActiveNav, { scroll: true, resize: true, run: true });

    // ===========================
    // 5. Smooth Scroll
    // ===========================
    function getElementDocumentTop(element) {
        let top = 0;
        let current = element;

        while (current) {
            top += current.offsetTop;
            current = current.offsetParent;
        }

        return top;
    }

    const ANCHOR_SCROLL_GAP = -20;

    function scrollToAnchorTarget(target, { behavior = 'smooth', extraOffset = 0 } = {}) {
        const navHeight = navbar ? navbar.offsetHeight : 72;
        const top = getElementDocumentTop(target) - navHeight - ANCHOR_SCROLL_GAP + extraOffset;
        window.scrollTo({ top, behavior });
    }

    function scrollToHashTarget(hash, options) {
        if (!hash || hash === '#') return;
        const target = $(hash);
        if (!target) return;

        scrollToAnchorTarget(target, options);
    }

    function runSkillsCardSpotlight(target) {
        if (!target || !target.classList.contains('skills-card')) return;

        const activeTimer = skillsSpotlightTimers.get(target);
        if (activeTimer) {
            clearTimeout(activeTimer);
        }

        target.classList.remove(SKILLS_SPOTLIGHT_CLASS);
        void target.offsetWidth;
        target.classList.add(SKILLS_SPOTLIGHT_CLASS);

        const cleanupTimer = setTimeout(() => {
            target.classList.remove(SKILLS_SPOTLIGHT_CLASS);
            skillsSpotlightTimers.delete(target);
        }, SKILLS_SPOTLIGHT_DURATION);
        skillsSpotlightTimers.set(target, cleanupTimer);
    }

    function spotlightSkillsCardWhenVisible(target) {
        if (!target || !target.classList.contains('skills-card')) return;

        if (!('IntersectionObserver' in window)) {
            setTimeout(() => runSkillsCardSpotlight(target), 650);
            return;
        }

        let didSpotlight = false;
        const observer = new IntersectionObserver((entries) => {
            const isVisible = entries.some(entry => entry.isIntersecting);
            if (!isVisible || didSpotlight) return;

            didSpotlight = true;
            observer.disconnect();
            runSkillsCardSpotlight(target);
        }, { threshold: 0.45 });

        observer.observe(target);

        setTimeout(() => {
            if (didSpotlight) return;
            didSpotlight = true;
            observer.disconnect();
            runSkillsCardSpotlight(target);
        }, 1400);
    }

    $$('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            const target = $(href);
            if (!target) return;
            e.preventDefault();

            if (this.classList.contains('floating-card') && href.startsWith('#skills')) {
                const floatingCardOffset = -40;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (window.location.hash !== href) {
                            history.pushState(null, '', href);
                        }
                        scrollToAnchorTarget(target, { extraOffset: floatingCardOffset });
                        spotlightSkillsCardWhenVisible(target);
                    });
                });
                return;
            }

            if (window.location.hash !== href) {
                history.pushState(null, '', href);
            }

            scrollToAnchorTarget(target);
        });
    });

    window.addEventListener('load', () => {
        if (!window.location.hash) return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => scrollToHashTarget(window.location.hash, { behavior: 'auto' }));
        });
    });

    window.addEventListener('hashchange', () => {
        scrollToHashTarget(window.location.hash);
    });

    // ===========================
    // 6. Credential Modal
    // ===========================
    function initCredentialModal() {
        const modal = $('#certModal');
        const modalClose = $('#certModalClose');
        const modalContent = $('#certModalContent');
        const pills = $$('.about-cert-item[role="button"][data-modal-type][data-modal-src]');
        if (!modal || !modalClose || !modalContent || !pills.length) return;

        let previousBodyOverflow = '';

        function normalizeModalSrc(raw) {
            if (!raw) return '';

            let value = String(raw).trim();
            if (!value) return '';

            value = value.replace(/^['"]+|['"]+$/g, '').trim();
            if (!value || /^javascript:/i.test(value)) return '';
            return value;
        }

        const clearModalContent = () => {
            modalContent.innerHTML = '';
        };

        const closeModal = () => {
            if (!modal.classList.contains('is-open')) return;
            modal.classList.remove('is-open', 'cert-modal--image');
            modal.setAttribute('aria-hidden', 'true');
            clearModalContent();
            document.body.style.overflow = previousBodyOverflow;
        };

        const openModal = (pill) => {
            const modalType = (pill.dataset.modalType || '').toLowerCase();
            const rawModalSrc = pill.dataset.modalSrc || '';
            const src = normalizeModalSrc(rawModalSrc);
            if (modalType !== 'image') return;
            if (!src) {
                console.error('Invalid modal src:', rawModalSrc);
                return;
            }

            clearModalContent();

            modal.classList.add('cert-modal--image');

            const img = document.createElement('img');
            img.src = src;
            img.alt = `${pill.textContent.trim()} credential`;
            img.loading = 'lazy';
            modalContent.appendChild(img);

            previousBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            modalClose.focus({ preventScroll: true });
        };

        pills.forEach(pill => {
            pill.addEventListener('click', () => openModal(pill));
            pill.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                openModal(pill);
            });
        });

        modalClose.addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal || modal.classList.contains('cert-modal--image')) {
                closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('is-open')) {
                closeModal();
            }
        });
    }

    initCredentialModal();

    // ===========================
    // 7. Stats Counter Animation
    // ===========================
    function animateCounter(el, target, suffix = '') {
        const duration = 2000;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(target * ease);

            el.textContent = current + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    function initCounters() {
        const counters = $$('.stats-number[data-count]');
        if (!counters.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseInt(el.dataset.count, 10);
                    const suffix = el.dataset.suffix || '';
                    animateCounter(el, target, suffix);
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.5 });

        counters.forEach(el => observer.observe(el));
    }

    initCounters();

    // ===========================
    // 8. Hero Visual Parallax
    // ===========================
    function initHeroVisualParallax() {
        const hero = $('#hero');
        const about = $('#about');
        const aboutHeader = about ? $('.section-header', about) : null;
        const heroVisual = $('.hero-visual');
        const cloudWrapper = $('.hero-clouds-wrapper');
        const cardsLayer = $('.hero-cards-layer');
        if (!hero || !heroVisual || !cloudWrapper || !cardsLayer) return;

        const getParallaxFactors = () => {
            const viewportWidth = window.innerWidth;
            if (viewportWidth <= 768) {
                return { cloud: 0.1, cards: 0.12 };
            }
            if (viewportWidth <= 1024) {
                return { cloud: 0.16, cards: 0.18 };
            }
            return { cloud: 0.2, cards: 0.2 };
        };

        const getCardClampOffset = () => {
            const viewportWidth = window.innerWidth;
            if (viewportWidth <= 768) return 96;
            if (viewportWidth <= 1024) return 84;
            return 0;
        };

        const updateParallax = () => {
            const scrolled = window.pageYOffset;
            const { cloud, cards } = getParallaxFactors();
            const heroBottom = hero.offsetTop + hero.offsetHeight;
            const visualBottom = heroVisual.offsetTop + heroVisual.offsetHeight;
            const headerLimit = aboutHeader
                ? (about.offsetTop + aboutHeader.offsetTop)
                : (heroBottom + 140);
            const overlapBuffer = window.innerWidth <= 768 ? 72 : 96;
            const maxVisibleOffset = Math.max(0, headerLimit - overlapBuffer - visualBottom);
            const cardClampOffset = getCardClampOffset();
            const maxOffset = Math.max(0, maxVisibleOffset - cardClampOffset);
            const cloudOffset = Math.min(scrolled * cloud, maxOffset);
            const cardsOffset = Math.min(scrolled * cards, maxOffset);
            const cloudOffsetValue = `${cloudOffset.toFixed(2)}px`;
            const cardsOffsetValue = `${cardsOffset.toFixed(2)}px`;

            cloudWrapper.style.transform =
                `translate3d(-50%, -50%, 0) translate3d(0, ${cloudOffsetValue}, 0)`;
            cardsLayer.style.transform = `translate3d(0, ${cardsOffsetValue}, 0)`;
        };

        registerViewportHandler(updateParallax, { scroll: true, resize: true, run: true });
    }

    initHeroVisualParallax();

    // ===========================
    // 9. Footer Visitor Telemetry
    // ===========================
    function initFooterTelemetry() {
        const regionEl = $('#footerRegion');
        const rttEl = $('#footerRtt');
        const ttfbEl = $('#footerTtfb');
        if (!regionEl || !rttEl || !ttfbEl) return;

        const getBroadRegion = (location) => {
            const country = String(location?.countryCode || '').toUpperCase();
            const continent = String(location?.continentCode || '').toUpperCase();
            const longitude = Number(location?.longitude);
            const hasLongitude = Number.isFinite(longitude);

            if (country === 'US') {
                if (!hasLongitude) return 'US-EAST';
                if (longitude < -112) return 'US-WEST';
                if (longitude < -90) return 'US-CENTRAL';
                return 'US-EAST';
            }

            if (country === 'CA') {
                return hasLongitude && longitude < -100 ? 'CA-WEST' : 'CA-EAST';
            }

            const southAmerica = new Set([
                'AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE'
            ]);
            if (southAmerica.has(country) || continent === 'SA') return 'SA-EAST';

            const euCentral = new Set([
                'AT', 'CH', 'CZ', 'DE', 'HR', 'HU', 'LI', 'PL', 'SI', 'SK'
            ]);
            if (euCentral.has(country)) return 'EU-CENTRAL';
            if (continent === 'EU') return 'EU-WEST';

            const apacEast = new Set(['CN', 'HK', 'JP', 'KP', 'KR', 'MO', 'MN', 'TW']);
            if (apacEast.has(country)) return 'APAC-EAST';

            const middleEast = new Set([
                'AE', 'BH', 'IL', 'IQ', 'IR', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'TR', 'YE'
            ]);
            if (middleEast.has(country)) return 'ME-CENTRAL';

            if (continent === 'AS' || continent === 'OC') return 'APAC-SOUTHEAST';
            if (continent === 'AF') return 'AF-CENTRAL';
            if (continent === 'AM') return 'AM-CENTRAL';
            return '';
        };

        const fetchWithTimeout = async (url, options, timeoutMs = 4000) => {
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

            try {
                return await fetch(url, { ...options, signal: controller.signal });
            } finally {
                window.clearTimeout(timeoutId);
            }
        };

        const updateTtfb = () => {
            if (!window.performance || typeof performance.getEntriesByType !== 'function') return;

            const [navigation] = performance.getEntriesByType('navigation');
            if (!navigation) return;

            const ttfb = navigation.responseStart - navigation.requestStart;
            if (Number.isFinite(ttfb) && ttfb >= 0) {
                ttfbEl.textContent = `${Math.round(ttfb)}ms`;
            }
        };

        const updateRegion = async () => {
            try {
                const response = await fetchWithTimeout('https://free.freeipapi.com/api/json/', {
                    cache: 'no-store',
                    credentials: 'omit',
                    headers: { Accept: 'application/json' },
                    referrerPolicy: 'no-referrer'
                });
                if (!response.ok) return;

                const location = await response.json();
                const broadRegion = getBroadRegion(location);
                if (broadRegion) regionEl.textContent = broadRegion;
            } catch {
                // Keep the neutral placeholder when location lookup is unavailable.
            }
        };

        const updateRtt = async () => {
            const samples = [];

            try {
                for (let sample = 0; sample < 3; sample += 1) {
                    const assetUrl = new URL('/assets/favicon/favicon-16x16.png', window.location.href);
                    assetUrl.searchParams.set('_rtt', `${Date.now()}-${sample}`);
                    const startedAt = performance.now();
                    const response = await fetchWithTimeout(assetUrl.href, {
                        method: 'HEAD',
                        cache: 'no-store',
                        credentials: 'same-origin'
                    });
                    if (!response.ok) return;
                    samples.push(performance.now() - startedAt);
                }

                samples.sort((a, b) => a - b);
                rttEl.textContent = `${Math.round(samples[1])}ms`;
            } catch {
                // Keep the neutral placeholder when same-origin timing is unavailable.
            }
        };

        const startNetworkTelemetry = () => {
            if (!window.fetch || !window.performance) return;
            void Promise.allSettled([updateRegion(), updateRtt()]);
        };

        updateTtfb();

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(startNetworkTelemetry, { timeout: 1200 });
        } else {
            window.setTimeout(startNetworkTelemetry, 0);
        }
    }

    initFooterTelemetry();

    // ===========================
    // 10. Contact Form
    // ===========================
    function initContactForm() {
        if (!contactForm) return;

        const submitBtn = contactForm.querySelector('.btn-submit');
        const formStatus = $('#formStatus', contactForm);
        const honeypotField = $('#bot-field', contactForm);
        const turnstileElement = $('.cf-turnstile', contactForm);
        if (!submitBtn) return;

        const originalHTML = submitBtn.innerHTML;
        const FORM_SUBMIT_COOLDOWN_MS = 15000;
        const CONTACT_COOLDOWN_STORAGE_KEY = 'cwd-contact-next-submit-at';
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
        const CONTACT_ERROR_MESSAGE = 'Message could not be sent right now. Please try again in a moment or email david@cloudwithdavid.com.';
        const MESSAGE_MAX_HEIGHT_PX = 360;
        let nextContactSubmitAt = 0;
        let turnstileWidgetId = null;
        let pendingTurnstileRequest = null;
        let successResetTimer = null;

        const fields = {
            name: $('#name', contactForm),
            email: $('#email', contactForm),
            subject: $('#subject', contactForm),
            message: $('#message', contactForm)
        };
        const fieldEntries = Object.entries(fields);
        const getFieldValue = field => field ? field.value.trim() : '';

        function autoResizeTextarea(textarea) {
            if (!textarea) return;
            textarea.style.height = 'auto';
            const nextHeight = Math.min(textarea.scrollHeight, MESSAGE_MAX_HEIGHT_PX);
            textarea.style.height = `${nextHeight}px`;
            textarea.style.overflowY = textarea.scrollHeight > MESSAGE_MAX_HEIGHT_PX ? 'auto' : 'hidden';
        }

        function setFormStatus(message = '', type = 'info') {
            if (!formStatus) return;
            formStatus.textContent = message;
            formStatus.className = `form-status form-status--${type}`;
        }

        function getPersistedCooldown() {
            try {
                return Number(localStorage.getItem(CONTACT_COOLDOWN_STORAGE_KEY) || 0);
            } catch {
                return 0;
            }
        }

        function setPersistedCooldown(value) {
            try {
                if (value > 0) {
                    localStorage.setItem(CONTACT_COOLDOWN_STORAGE_KEY, String(value));
                } else {
                    localStorage.removeItem(CONTACT_COOLDOWN_STORAGE_KEY);
                }
            } catch {
                // Ignore storage failures.
            }
        }

        function clearFieldErrors() {
            fieldEntries.forEach(([, field]) => field?.removeAttribute('aria-invalid'));
        }

        function validateContactForm() {
            clearFieldErrors();
            setFormStatus('', 'info');

            let firstInvalid = null;
            for (const [name, field] of fieldEntries) {
                const value = getFieldValue(field);
                const isValid = name === 'email' ? EMAIL_RE.test(value) : Boolean(value);
                if (!isValid) {
                    field?.setAttribute('aria-invalid', 'true');
                    firstInvalid = firstInvalid || field;
                }
            }

            if (firstInvalid) {
                firstInvalid.focus();
                setFormStatus('Please complete all fields with valid information before sending.', 'error');
                return false;
            }

            return true;
        }

        if (fields.message) {
            fields.message.addEventListener('input', () => autoResizeTextarea(fields.message));
            // Covers form-value restore/autofill on reload.
            autoResizeTextarea(fields.message);
        }

        function waitForTurnstile(timeoutMs = 8000) {
            if (window.turnstile) {
                return Promise.resolve(window.turnstile);
            }

            return new Promise((resolve, reject) => {
                const start = Date.now();
                const timerId = setInterval(() => {
                    if (window.turnstile) {
                        clearInterval(timerId);
                        resolve(window.turnstile);
                        return;
                    }
                    if (Date.now() - start >= timeoutMs) {
                        clearInterval(timerId);
                        reject(new Error('Turnstile unavailable'));
                    }
                }, 100);
            });
        }

        function ensureTurnstileWidget(turnstile) {
            if (!turnstileElement) {
                throw new Error('Turnstile element missing');
            }
            if (turnstileWidgetId !== null) {
                return turnstileWidgetId;
            }

            const sitekey = (turnstileElement.dataset.sitekey || '').trim();
            if (!sitekey || sitekey === 'PASTE_TURNSTILE_SITE_KEY_HERE') {
                throw new Error('Turnstile site key missing');
            }

            turnstileWidgetId = turnstile.render(turnstileElement, {
                sitekey,
                size: 'invisible',
                callback: token => settleTurnstileRequest('resolve', token),
                'error-callback': code => settleTurnstileRequest(
                    'reject', new Error(`Turnstile challenge failed${code ? ` (${code})` : ''}`)
                ),
                'expired-callback': resetTurnstileWidget
            });

            return turnstileWidgetId;
        }

        function settleTurnstileRequest(action, value) {
            if (!pendingTurnstileRequest) return;
            const pending = pendingTurnstileRequest;
            clearTimeout(pending.timeoutId);
            pendingTurnstileRequest = null;
            pending[action](value);
        }

        async function getTurnstileToken() {
            const turnstile = await waitForTurnstile();
            const widgetId = ensureTurnstileWidget(turnstile);

            if (typeof turnstile.getResponse === 'function') {
                const existingToken = turnstile.getResponse(widgetId);
                if (existingToken) {
                    return existingToken;
                }
            }

            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    settleTurnstileRequest('reject', new Error('Turnstile timed out'));
                }, 10000);

                pendingTurnstileRequest = { resolve, reject, timeoutId };

                try {
                    turnstile.execute(widgetId);
                } catch (err) {
                    settleTurnstileRequest('reject', err);
                }
            });
        }

        function resetTurnstileWidget() {
            if (turnstileWidgetId === null || !window.turnstile || typeof window.turnstile.reset !== 'function') {
                return;
            }

            try {
                window.turnstile.reset(turnstileWidgetId);
            } catch {
                // Ignore Turnstile reset failures.
            }
        }

        function resetSubmitButton() {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHTML;
            submitBtn.classList.remove('btn-submit--success');
            successResetTimer = null;
        }

        contactForm.addEventListener('submit', async (e) => {
            if (!window.fetch) return;
            e.preventDefault();

            if (!validateContactForm()) {
                return;
            }

            const now = Date.now();
            const persistedCooldown = getPersistedCooldown();
            if (persistedCooldown > nextContactSubmitAt) {
                nextContactSubmitAt = persistedCooldown;
            }

            if (now < nextContactSubmitAt) {
                const waitSeconds = Math.ceil((nextContactSubmitAt - now) / 1000);
                const cooldownMessage = `Please wait ${waitSeconds}s before sending another message.`;
                setFormStatus(cooldownMessage, 'error');
                return;
            }
            nextContactSubmitAt = now + FORM_SUBMIT_COOLDOWN_MS;
            setPersistedCooldown(nextContactSubmitAt);

            // Loading state
            if (successResetTimer) {
                clearTimeout(successResetTimer);
                successResetTimer = null;
            }
            submitBtn.classList.remove('btn-submit--success');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Sending...</span><i class="fas fa-spinner fa-spin"></i>';
            contactForm.setAttribute('aria-busy', 'true');
            setFormStatus('Sending your message...', 'info');

            try {
                const turnstileToken = await getTurnstileToken();
                const payload = {
                    ...Object.fromEntries(fieldEntries.map(([name, field]) => [name, getFieldValue(field)])),
                    honeypot: getFieldValue(honeypotField),
                    turnstileToken
                };

                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    let apiError = '';
                    try {
                        const errorBody = await response.json();
                        apiError = String(errorBody?.error || '').trim();
                    } catch {
                        apiError = '';
                    }

                    const error = new Error(`Contact API request failed (${response.status})`);
                    error.apiError = apiError;
                    throw error;
                }

                submitBtn.innerHTML = '<span>Message sent</span><i class="fas fa-check"></i>';
                submitBtn.classList.add('btn-submit--success');
                contactForm.reset();
                autoResizeTextarea(fields.message);
                clearFieldErrors();
                resetTurnstileWidget();
                setFormStatus('Message sent successfully! I will get back to you soon.', 'success');

                const cooldownRemaining = Math.max(0, nextContactSubmitAt - Date.now());
                successResetTimer = setTimeout(resetSubmitButton, cooldownRemaining);
            } catch (err) {
                nextContactSubmitAt = 0;
                setPersistedCooldown(0);

                const apiError = String(err?.apiError || '').trim();
                const rawErrorMessage = String(err?.message || '').trim();
                let friendlyError = CONTACT_ERROR_MESSAGE;
                if (apiError === 'turnstile' || /turnstile/i.test(rawErrorMessage)) {
                    friendlyError = 'Security check failed. Please try again.';
                } else if (apiError === 'server_config') {
                    friendlyError = 'Contact form is temporarily unavailable. Please email david@cloudwithdavid.com.';
                } else if (apiError === 'email') {
                    friendlyError = 'Message could not be delivered right now. Please try again shortly.';
                }

                resetTurnstileWidget();

                if (rawErrorMessage) {
                    console.error('Contact form submit error:', rawErrorMessage);
                }

                setFormStatus(friendlyError, 'error');
                resetSubmitButton();
            } finally {
                contactForm.removeAttribute('aria-busy');
            }
        });
    }

    initContactForm();

})();
