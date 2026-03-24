/* ================================================================
   CloudWithDavid — Main JavaScript
   Feature-rich, production-ready, vanilla JS
   ================================================================ */

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
    const themeControls = $$('[data-theme-segmented]');
    const themeSegments = $$('[data-theme-option]');
    const themeToggles = $$('[data-theme-toggle]');
    const themeToggleIcons = $$('[data-theme-toggle-icon]');
    const scrollProgress = $('#scrollProgress');
    const backToTop = $('#backToTop');
    const heroCanvas = $('#heroParticles');
    const contactForm = $('#contactForm');
    const notificationContainer = $('#notificationContainer');
    const sectionDropdownControllers = new Map();
    const TOAST_TRIGGER_COOLDOWN_MS = 2000;
    const DEPLOY_BEACON_FLAG_PARAM = 'deploy';
    const DEPLOY_BEACON_FLAG_VALUE = 'key';
    const DEPLOY_BEACON_START = 0;
    const DEPLOY_BEACON_COUNTER_KEY = 'cwd-deploy-beacon-counter';
    const DEPLOY_BEACON_LAST_VERSION_KEY = 'cwd-deploy-beacon-last-version';
    const THEME_STORAGE_KEY = 'cwd-theme';
    const THEME_PULSE_SEEN_KEY = 'cwd-theme-pulse-seen';
    const THEME_PULSE_CLASS = 'theme-segmented--pulse';
    const THEME_PULSE_VARIANTS = ['desktop', 'mobile-inline'];
    let nextToastAllowedAt = 0;

    // ===========================
    // 1. Theme Toggle (Dark/Light)
    // ===========================
    const systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');

    function getStoredTheme() {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return stored === 'dark' || stored === 'light' ? stored : '';
    }

    function getSystemTheme() {
        return systemThemeMedia.matches ? 'dark' : 'light';
    }

    function updateThemeControlState(theme) {
        themeSegments.forEach(segment => {
            const isActive = segment.dataset.themeOption === theme;
            segment.classList.toggle('is-active', isActive);
            segment.setAttribute('aria-pressed', String(isActive));
            segment.setAttribute('aria-selected', String(isActive));
        });

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

        themeControls.forEach(control => {
            control.setAttribute('data-active-theme', theme);
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

    function readPulseSeenVariants() {
        const raw = localStorage.getItem(THEME_PULSE_SEEN_KEY);
        if (!raw) return new Set();
        // Backward compatibility with previous single-flag format.
        if (raw === '1') return new Set(THEME_PULSE_VARIANTS);
        return new Set(
            raw
                .split(',')
                .map(v => v.trim())
                .filter(Boolean)
        );
    }

    function writePulseSeenVariants(seenSet) {
        if (!seenSet || !seenSet.size) return;
        const serialized = [...seenSet]
            .filter(v => THEME_PULSE_VARIANTS.includes(v))
            .join(',');
        if (serialized) {
            localStorage.setItem(THEME_PULSE_SEEN_KEY, serialized);
        }
    }

    function isElementVisible(element) {
        if (!element) return false;
        const styles = window.getComputedStyle(element);
        return styles.display !== 'none' && styles.visibility !== 'hidden' && element.getClientRects().length > 0;
    }

    function triggerThemePulse(control) {
        if (!control) return;
        control.classList.remove(THEME_PULSE_CLASS);
        // Force reflow to restart finite pulse animation when needed.
        void control.offsetWidth;
        const cleanupPulse = () => control.classList.remove(THEME_PULSE_CLASS);
        control.addEventListener('animationend', (event) => {
            if (event.animationName !== 'themeSegmentedPulse') return;
            cleanupPulse();
        }, { once: true });
        control.classList.add(THEME_PULSE_CLASS);
        setTimeout(cleanupPulse, 6000);
    }

    function maybeShowThemePulse() {
        if (getStoredTheme()) return;

        const seenVariants = readPulseSeenVariants();
        let didUpdate = false;

        THEME_PULSE_VARIANTS.forEach(variant => {
            if (seenVariants.has(variant)) return;
            const control = $(`[data-theme-segmented][data-theme-variant="${variant}"]`);
            if (!isElementVisible(control)) return;
            triggerThemePulse(control);
            seenVariants.add(variant);
            didUpdate = true;
        });

        if (didUpdate) {
            writePulseSeenVariants(seenVariants);
        }
    }

    function initTheme() {
        const stored = getStoredTheme();
        if (stored) {
            applyTheme(stored, { persist: false });
            return;
        }
        applyTheme(getSystemTheme(), { persist: false });
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || getSystemTheme();
        applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    if (themeSegments.length) {
        themeSegments.forEach(segment => {
            segment.addEventListener('click', () => {
                const control = segment.closest('[data-theme-segmented]');
                const variant = control ? control.dataset.themeVariant : '';
                const shouldToggleDirectly = variant === 'mobile-inline' || variant === 'desktop';
                if (shouldToggleDirectly) {
                    toggleTheme();
                } else {
                    const targetTheme = segment.dataset.themeOption;
                    if (targetTheme !== 'dark' && targetTheme !== 'light') return;
                    applyTheme(targetTheme);
                }
                if (segment.closest('.nav-theme-item')) {
                    closeMobileMenu();
                }
            });
        });
    }

    if (themeToggles.length) {
        themeToggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggleTheme();
                if (toggle.closest('.nav-theme-item')) {
                    closeMobileMenu();
                }
            });
        });
    }

    if (themeControls.length) {
        themeControls.forEach(control => {
            control.addEventListener('click', (e) => {
                if (e.target.closest('[data-theme-option], [data-theme-toggle]')) return;
                toggleTheme();
                if (control.closest('.nav-theme-item')) {
                    closeMobileMenu();
                }
            });
        });
    }

    const syncWithSystemTheme = (event) => {
        if (getStoredTheme()) return;
        applyTheme(event.matches ? 'dark' : 'light', { persist: false });
    };

    if (typeof systemThemeMedia.addEventListener === 'function') {
        systemThemeMedia.addEventListener('change', syncWithSystemTheme);
    } else if (typeof systemThemeMedia.addListener === 'function') {
        systemThemeMedia.addListener(syncWithSystemTheme);
    }

    function getMainScriptVersion() {
        const mainScript = $('script[src*="js/main.js"]');
        if (!mainScript) return '';

        try {
            const scriptUrl = new URL(mainScript.getAttribute('src'), window.location.href);
            return scriptUrl.searchParams.get('v') || '';
        } catch {
            return '';
        }
    }

    function getDeployBeaconId(jsVersion) {
        let counter = DEPLOY_BEACON_START;

        try {
            const storedCounter = Number.parseInt(localStorage.getItem(DEPLOY_BEACON_COUNTER_KEY) || '', 10);
            if (Number.isFinite(storedCounter)) {
                counter = storedCounter;
            }

            const lastSeenVersion = localStorage.getItem(DEPLOY_BEACON_LAST_VERSION_KEY) || '';

            if (jsVersion) {
                if (!lastSeenVersion) {
                    localStorage.setItem(DEPLOY_BEACON_COUNTER_KEY, String(counter));
                    localStorage.setItem(DEPLOY_BEACON_LAST_VERSION_KEY, jsVersion);
                } else if (lastSeenVersion !== jsVersion) {
                    counter += 1;
                    localStorage.setItem(DEPLOY_BEACON_COUNTER_KEY, String(counter));
                    localStorage.setItem(DEPLOY_BEACON_LAST_VERSION_KEY, jsVersion);
                }
            }
        } catch {
            // Ignore storage errors and fall back to current in-memory value.
        }

        return counter;
    }

    function initDeployBeacon() {
        const params = new URLSearchParams(window.location.search);
        if (params.get(DEPLOY_BEACON_FLAG_PARAM) !== DEPLOY_BEACON_FLAG_VALUE) return;
        if ($('#deployBeacon')) return;

        const jsVersion = getMainScriptVersion() || 'no-version';
        const deployBeaconId = getDeployBeaconId(jsVersion);
        const beacon = document.createElement('aside');
        beacon.id = 'deployBeacon';
        beacon.className = 'deploy-beacon';
        beacon.setAttribute('aria-hidden', 'true');
        beacon.innerHTML = `
            <span class="deploy-beacon__label">Deploy Beacon</span>
            <span class="deploy-beacon__value">id:${deployBeaconId}</span>
            <span class="deploy-beacon__meta">js:${jsVersion}</span>
        `;
        document.body.appendChild(beacon);
    }

    initTheme();
    maybeShowThemePulse();
    initDeployBeacon();
    window.addEventListener('resize', maybeShowThemePulse, { passive: true });

    // ===========================
    // 2. Mobile Navigation
    // ===========================
    function closeMobileMenu() {
        if (!navLinks || !navToggle) return;
        navLinks.classList.remove('active');
        navToggle.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
        if (navbar) {
            navbar.classList.remove('nav-menu-open');
        }
    }

    if (navToggle) {
        navToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('active');
            navToggle.classList.toggle('active');
            navToggle.setAttribute('aria-expanded', String(isOpen));
            if (navbar) {
                navbar.classList.toggle('nav-menu-open', isOpen);
            }
            if (isOpen) {
                maybeShowThemePulse();
            }
        });
    }

    // Close on link click
    $$('.nav-links a').forEach(link => {
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
    let lastScrollY = 0;
    let ticking = false;
    let footerInView = false;

    function onScroll() {
        const scrollY = window.pageYOffset;

        // Navbar shadow
        if (navbar) {
            navbar.classList.toggle('scrolled', scrollY > 50);
        }

        // Scroll progress bar
        if (scrollProgress) {
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollY / docHeight) * 100 : 0;
            scrollProgress.style.width = progress + '%';
        }

        // Back to top button
        if (backToTop) {
            backToTop.classList.toggle('visible', footerInView);
        }

        lastScrollY = scrollY;
        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(onScroll);
            ticking = true;
        }
    }, { passive: true });

    // ===========================
    // 3c. Contact Link Scroll Activation (Mobile + Tablet)
    // ===========================
    function initContactLinkScrollActivation() {
        const contactLinks = $$('.contact-link');
        if (!contactLinks.length) return;

        const MOBILE_TABLET_MAX_WIDTH = 1024;
        const TABLET_MIN_WIDTH = 770;
        const MID_MOBILE_MIN_WIDTH = 455;

        function getActiveBandPx(viewportWidth) {
            if (viewportWidth > MOBILE_TABLET_MAX_WIDTH) return null;
            if (viewportWidth >= TABLET_MIN_WIDTH) {
                return { topPx: 475, bottomPx: 525 };
            }
            if (viewportWidth >= MID_MOBILE_MIN_WIDTH) {
                return { topPx: 450, bottomPx: 500 };
            }
            return { topPx: 425, bottomPx: 475 };
        }

        function update() {
            const activeBand = getActiveBandPx(window.innerWidth);

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

        let rangeTicking = false;
        const onRangeScroll = () => {
            if (rangeTicking) return;
            rangeTicking = true;
            requestAnimationFrame(() => {
                update();
                rangeTicking = false;
            });
        };

        window.addEventListener('scroll', onRangeScroll, { passive: true });
        window.addEventListener('resize', onRangeScroll);
        update();
    }

    initContactLinkScrollActivation();

    // Back to top click
    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    function initBackToTopFooterClearance() {
        if (!backToTop) return;
        const footer = $('.footer');
        if (!footer) return;

        const observer = new IntersectionObserver(([entry]) => {
            footerInView = entry.isIntersecting;
            backToTop.classList.toggle('back-to-top--footer-clear', footerInView);
            backToTop.classList.toggle('visible', footerInView);
        }, {
            threshold: 0.01
        });

        observer.observe(footer);
    }

    initBackToTopFooterClearance();

    // ===========================
    // 4. Active Nav Link Tracking
    // ===========================
    function updateActiveNav() {
        const sections = $$('section[id]');
        const navHeight = navbar ? navbar.offsetHeight : 72;
        const scrollY = window.pageYOffset + navHeight + 100;

        let currentId = '';

        sections.forEach(section => {
            const top = section.offsetTop;
            const bottom = top + section.offsetHeight;
            if (scrollY >= top && scrollY < bottom) {
                currentId = section.id;
            }
        });

        $$('.nav-links a').forEach(link => {
            const href = link.getAttribute('href');
            link.classList.toggle('active', href === `#${currentId}`);
        });
    }

    window.addEventListener('scroll', () => {
        requestAnimationFrame(updateActiveNav);
    }, { passive: true });
    window.addEventListener('resize', () => {
        requestAnimationFrame(updateActiveNav);
    });
    requestAnimationFrame(updateActiveNav);

    // ===========================
    // 5. Smooth Scroll
    // ===========================
    function expandSkillsDropdown() {
        const skillsDropdown = sectionDropdownControllers.get('#skillsDropdownContent');
        if (skillsDropdown) {
            skillsDropdown.expand();
            return;
        }

        const content = $('#skillsDropdownContent');
        if (!content) return;

        $$('[data-skills-toggle]').forEach(toggle => {
            toggle.setAttribute('aria-expanded', 'true');
        });
        content.classList.remove('is-collapsed');
        content.closest('.timeline-dropdown')?.classList.add('is-expanded');
    }

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

    function scrollToAnchorTarget(target, extraOffset = 0) {
        const navHeight = navbar ? navbar.offsetHeight : 72;
        const top = getElementDocumentTop(target) - navHeight - ANCHOR_SCROLL_GAP + extraOffset;
        window.scrollTo({ top, behavior: 'smooth' });
    }

    function scrollToHashTarget(hash, { behavior = 'smooth', extraOffset = 0 } = {}) {
        if (!hash || hash === '#') return;
        const target = $(hash);
        if (!target) return;

        const navHeight = navbar ? navbar.offsetHeight : 72;
        const top = getElementDocumentTop(target) - navHeight - ANCHOR_SCROLL_GAP + extraOffset;
        window.scrollTo({ top, behavior });
    }

    $$('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', async function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            const target = $(href);
            if (!target) return;
            e.preventDefault();

            if (this.classList.contains('floating-card') && href.startsWith('#skills')) {
                const floatingCardOffset = -40;
                expandSkillsDropdown();
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (window.location.hash !== href) {
                            history.pushState(null, '', href);
                        }
                        scrollToAnchorTarget(target, floatingCardOffset);
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
        const pills = $$('.cert-pill');
        if (!modal || !modalClose || !modalContent || !pills.length) return;

        let previousBodyOverflow = '';

        function normalizeModalSrc(raw, modalType) {
            if (!raw) return '';

            let value = String(raw).trim();
            if (!value) return '';

            // Handle HTML-encoded quotes from copied embed snippets.
            value = value
                .replace(/&quot;|&#34;/gi, '"')
                .replace(/&apos;|&#39;/gi, "'");

            if (/<iframe/i.test(value) || /<img/i.test(value)) {
                const srcMatch = value.match(/src\s*=\s*["']([^"']+)["']/i);
                value = srcMatch ? srcMatch[1].trim() : '';
            } else {
                value = value.replace(/^['"]+|['"]+$/g, '').trim();
            }

            if (!value || /^javascript:/i.test(value)) return '';

            if (modalType !== 'iframe') return value;

            try {
                const url = new URL(value, window.location.href);
                if (!/^https?:$/i.test(url.protocol)) return '';

                if (/drive\.google\.com$/i.test(url.hostname)) {
                    const idFromPath = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                    const fileId = idFromPath ? idFromPath[1] : (url.searchParams.get('id') || '');
                    if (fileId) return `https://drive.google.com/file/d/${fileId}/preview`;
                }

                return url.toString();
            } catch {
                return '';
            }
        }

        const clearModalContent = () => {
            modalContent.innerHTML = '';
        };

        const closeModal = () => {
            if (!modal.classList.contains('is-open')) return;
            modal.classList.remove('is-open');
            modal.classList.remove('cert-modal--image');
            modal.setAttribute('aria-hidden', 'true');
            clearModalContent();
            document.body.style.overflow = previousBodyOverflow;
        };

        const openModal = (pill) => {
            const modalType = (pill.dataset.modalType || '').toLowerCase();
            const rawModalSrc = pill.dataset.modalSrc || '';
            const src = normalizeModalSrc(rawModalSrc, modalType);
            if (modalType !== 'iframe' && modalType !== 'image') return;
            if (!src) {
                console.error('Invalid modal src:', rawModalSrc);
                return;
            }

            clearModalContent();

            // TEMP DEBUG: remove after modal sources are verified in production.
            console.log('modal src:', src);
            let mediaEl;
            modal.classList.toggle('cert-modal--image', modalType === 'image');

            if (modalType === 'image') {
                const img = document.createElement('img');
                img.src = src;
                img.alt = `${pill.textContent.trim()} credential`;
                img.loading = 'lazy';
                mediaEl = img;
            } else {
                const iframe = document.createElement('iframe');
                iframe.src = src;
                iframe.loading = 'lazy';
                iframe.referrerPolicy = 'no-referrer';
                iframe.allowFullscreen = true;
                iframe.title = `${pill.textContent.trim()} preview`;
                mediaEl = iframe;
            }
            modalContent.appendChild(mediaEl);

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
            if (e.target === modal) {
                closeModal();
                return;
            }

            if (modal.classList.contains('cert-modal--image')) {
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
    // 7. Section Dropdown Toggles
    // ===========================
    function initSectionDropdown(toggleSelector, contentSelector, options = {}) {
        const toggles = $$(toggleSelector);
        const content = $(contentSelector);
        const dropdown = content ? content.closest('.timeline-dropdown') : null;
        const mainToggle = toggles.find(toggle => toggle.classList.contains('timeline-toggle-main'));
        const sectionTitle = content ? $('.section-title', content) : null;
        if (!toggles.length || !content) return;

        const syncToggleMetrics = () => {
            if (!dropdown || !mainToggle) return;
            const mainToggleWidth = mainToggle.getBoundingClientRect().width;
            const mainToggleHeight = mainToggle.getBoundingClientRect().height;
            const sectionTitleWidth = sectionTitle ? sectionTitle.getBoundingClientRect().width : 0;
            dropdown.style.setProperty('--timeline-toggle-main-half-width', `${mainToggleWidth / 2}px`);
            dropdown.style.setProperty('--timeline-toggle-main-half-height', `${mainToggleHeight / 2}px`);
            dropdown.style.setProperty('--timeline-toggle-title-half-width', `${sectionTitleWidth / 2}px`);
        };

        const setExpanded = (expanded, { force = false } = {}) => {
            const isCurrentlyExpanded = toggles[0].getAttribute('aria-expanded') === 'true';
            if (!force && expanded === isCurrentlyExpanded) {
                syncToggleMetrics();
                return;
            }

            toggles.forEach(toggle => {
                toggle.setAttribute('aria-expanded', String(expanded));
            });
            content.classList.toggle('is-collapsed', !expanded);
            if (dropdown) {
                dropdown.classList.toggle('is-expanded', expanded);
            }
            syncToggleMetrics();
        };

        const initiallyExpanded = typeof options.getInitialExpanded === 'function'
            ? options.getInitialExpanded({ content, dropdown, toggles })
            : !content.classList.contains('is-collapsed');
        setExpanded(initiallyExpanded, { force: true });
        syncToggleMetrics();

        toggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const isExpanded = toggles[0].getAttribute('aria-expanded') === 'true';
                const nextExpanded = !isExpanded;
                setExpanded(nextExpanded);
            });
        });

        sectionDropdownControllers.set(contentSelector, {
            expand: () => setExpanded(true)
        });

        window.addEventListener('resize', syncToggleMetrics);
        if (document.fonts?.ready) {
            document.fonts.ready.then(syncToggleMetrics);
        }
    }

    initSectionDropdown('[data-skills-toggle]', '#skillsDropdownContent', {
        getInitialExpanded: ({ content }) => {
            const skillsCards = $$('.skills-card', content);
            if (skillsCards.length >= 2) {
                const [firstCard, secondCard] = skillsCards;
                return Math.abs(firstCard.offsetTop - secondCard.offsetTop) < 8;
            }

            return !content.classList.contains('is-collapsed');
        }
    });
    initSectionDropdown('[data-timeline-toggle]', '#timelineDropdownContent');

    // ===========================
    // 7. Scroll Animations (IntersectionObserver)
    // ===========================
    function initScrollAnimations() {
        const elements = $$('[data-animate]');
        if (!elements.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const delay = parseInt(el.dataset.delay || '0', 10);
                    setTimeout(() => {
                        el.classList.add('animated');
                    }, delay);
                    observer.unobserve(el);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        elements.forEach(el => observer.observe(el));
    }

    initScrollAnimations();

    // ===========================
    // 8. Progress Bars Animation
    // ===========================
    function initProgressBars() {
        const bars = $$('.progress-bar[data-progress]');
        if (!bars.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const bar = entry.target;
                    const target = parseInt(bar.dataset.progress, 10);
                    setTimeout(() => {
                        bar.style.width = target + '%';
                    }, 300);
                    observer.unobserve(bar);
                }
            });
        }, { threshold: 0.3 });

        bars.forEach(bar => observer.observe(bar));
    }

    initProgressBars();

    // ===========================
    // 9. Stats Counter Animation
    // ===========================
    function animateCounter(el, target, suffix = '') {
        const duration = 2000;
        const startTime = performance.now();
        const startVal = 0;

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(startVal + (target - startVal) * ease);

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
    // 10. Project Filtering
    // ===========================
    function initProjectFilters() {
        const filters = $$('.filter-btn');
        const cards = $$('.project-card[data-status]');
        const groups = $$('.project-group');
        if (!filters.length || !cards.length) return;

        const syncGroupVisibility = () => {
            groups.forEach(group => {
                const visibleCards = $$('.project-card[data-status]:not(.hidden)', group).length;
                group.classList.toggle('hidden', visibleCards === 0);
            });
        };

        filters.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;

                // Update active
                filters.forEach(f => f.classList.remove('active'));
                btn.classList.add('active');

                // Filter cards
                cards.forEach(card => {
                    const status = card.dataset.status;
                    const match = filter === 'all' || status === filter;
                    card.classList.toggle('hidden', !match);

                    // Re-trigger animation
                    if (match) {
                        card.style.animation = 'none';
                        card.offsetHeight; // force reflow
                        card.style.animation = '';
                    }
                });

                syncGroupVisibility();
            });
        });

        syncGroupVisibility();
    }

    initProjectFilters();

    // ===========================
    // 11. Writing Card CTA Guard
    // ===========================
    function initWritingCardCtas() {
        const cards = $$('.blog-card');
        if (!cards.length) return;

        const isValidExternalUrl = (href) => {
            if (!href) return false;
            try {
                const url = new URL(href, window.location.href);
                const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
                return isHttp && url.origin !== window.location.origin;
            } catch {
                return false;
            }
        };

        cards.forEach(card => {
            const cta = $('.blog-link', card);
            const status = (card.dataset.status || '').toLowerCase();
            const isUpcoming = status === 'upcoming' || Boolean($('.blog-upcoming-badge', card));
            const href = cta ? (cta.getAttribute('href') || '').trim() : '';
            const hasValidCta = cta ? isValidExternalUrl(href) : false;

            if (isUpcoming || !hasValidCta) {
                if (cta) cta.remove();
                card.classList.add('blog-card--no-cta');
                return;
            }

            card.classList.remove('blog-card--no-cta');
        });
    }

    initWritingCardCtas();

    // ===========================
    // 12. Repo Coming Soon Trigger
    // ===========================
    function initRepoComingSoonTriggers() {
        const triggers = $$('[data-repo-soon]');
        if (!triggers.length) return;

        const getSafeGithubProfileUrl = (rawValue) => {
            const fallback = 'https://github.com/cloudwithdavid';
            const candidate = String(rawValue || fallback).trim();

            try {
                const url = new URL(candidate, window.location.href);
                const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
                const isGithub = /^(www\.)?github\.com$/i.test(url.hostname);
                if (!isHttp || !isGithub) return fallback;
                return url.toString();
            } catch {
                return fallback;
            }
        };

        const buildRepoSoonMessage = (profileUrl) => {
            const wrapper = document.createElement('span');
            wrapper.append('Repo coming soon. ');

            const mobileBreak = document.createElement('span');
            mobileBreak.className = 'notification-mobile-break';
            mobileBreak.append('Check out my ');

            const profileLink = document.createElement('a');
            profileLink.href = profileUrl;
            profileLink.target = '_blank';
            profileLink.rel = 'noopener noreferrer';
            profileLink.className = 'notification-link';
            profileLink.textContent = 'GitHub profile';

            mobileBreak.append(profileLink, '.');
            wrapper.appendChild(mobileBreak);
            return wrapper;
        };

        triggers.forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const profileUrl = getSafeGithubProfileUrl(trigger.dataset.profileUrl || '');
                showNotification(
                    'Repo coming soon.',
                    'success',
                    { contentNode: buildRepoSoonMessage(profileUrl) }
                );
            });
        });
    }

    initRepoComingSoonTriggers();

    // ===========================
    // 12. Hero Particle Canvas
    // ===========================
    function initParticles() {
        if (!heroCanvas) return;

        const ctx = heroCanvas.getContext('2d');
        let particles = [];
        let animId;
        let w, h;

        function resize() {
            const hero = heroCanvas.parentElement;
            w = heroCanvas.width = hero.offsetWidth;
            h = heroCanvas.height = hero.offsetHeight;
        }

        function createParticle() {
            return {
                x: Math.random() * w,
                y: Math.random() * h,
                size: Math.random() * 2 + 0.5,
                speedX: (Math.random() - 0.5) * 0.16,
                speedY: (Math.random() - 0.5) * 0.16,
                opacity: Math.random() * 0.5 + 0.1,
                pulse: Math.random() * Math.PI * 2
            };
        }

        function init() {
            resize();
            const count = Math.min(Math.floor((w * h) / 12000), 80);
            particles = Array.from({ length: count }, createParticle);
        }

        function draw() {
            ctx.clearRect(0, 0, w, h);

            const theme = document.documentElement.getAttribute('data-theme');
            const color = theme === 'light' ? '78,160,255' : '180,210,255';

            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;
                p.pulse += 0.02;

                // Wrap around
                if (p.x < 0) p.x = w;
                if (p.x > w) p.x = 0;
                if (p.y < 0) p.y = h;
                if (p.y > h) p.y = 0;

                const pulseOpacity = p.opacity * (0.6 + 0.4 * Math.sin(p.pulse));

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${color}, ${pulseOpacity})`;
                ctx.fill();
            });

            // Draw connections
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 120) {
                        const opacity = (1 - dist / 120) * 0.12;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(${color}, ${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            animId = requestAnimationFrame(draw);
        }

        init();
        draw();

        window.addEventListener('resize', () => {
            cancelAnimationFrame(animId);
            init();
            draw();
        });

        // Pause when not visible
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                draw();
            } else {
                cancelAnimationFrame(animId);
            }
        }, { threshold: 0 });

        observer.observe(heroCanvas);
    }

    initParticles();

    // ===========================
    // 13. Hero Visual Parallax
    // ===========================
    function initHeroVisualParallax() {
        const hero = $('#hero');
        const about = $('#about');
        const aboutHeader = about ? $('.section-header', about) : null;
        const heroVisual = $('.hero-visual');
        const cloudWrapper = $('.hero-clouds-wrapper');
        const cardsLayer = $('.hero-cards-layer');
        if (!hero || !heroVisual || !cloudWrapper || !cardsLayer) return;

        let ticking = false;
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
            const sharedMobileClampOffset = window.innerWidth <= 1024 ? cardClampOffset : 0;
            const cloudMaxVisibleOffset = Math.max(0, maxVisibleOffset - sharedMobileClampOffset);
            const cardMaxVisibleOffset = Math.max(0, maxVisibleOffset - cardClampOffset);
            const cloudOffset = Math.min(scrolled * cloud, cloudMaxVisibleOffset);
            const cardsOffset = Math.min(scrolled * cards, cardMaxVisibleOffset);
            const cloudOffsetValue = `${cloudOffset.toFixed(2)}px`;
            const cardsOffsetValue = `${cardsOffset.toFixed(2)}px`;

            cloudWrapper.style.transform =
                `translate3d(-50%, -50%, 0) translate3d(0, ${cloudOffsetValue}, 0)`;
            cardsLayer.style.transform = `translate3d(0, ${cardsOffsetValue}, 0)`;
        };

        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;

            requestAnimationFrame(() => {
                updateParallax();
                ticking = false;
            });
        }, { passive: true });
        window.addEventListener('resize', updateParallax, { passive: true });

        updateParallax();
    }

    initHeroVisualParallax();

    // ===========================
    // 14. Contact Form
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
        const CONTACT_ERROR_MESSAGE = 'Message could not be sent right now. Please try again in a moment or email contact@cloudwithdavid.com.';
        const MESSAGE_MAX_HEIGHT_PX = 360;
        let nextContactSubmitAt = 0;
        let turnstileWidgetId = null;
        let pendingTurnstileRequest = null;

        const fields = {
            name: $('#name', contactForm),
            email: $('#email', contactForm),
            subject: $('#subject', contactForm),
            message: $('#message', contactForm)
        };
        const messageGroup = fields.message ? fields.message.closest('.form-group--message') : null;
        const messageScrollIndicator = messageGroup ? $('.textarea-scroll-indicator', messageGroup) : null;
        const messageScrollThumb = messageGroup ? $('.textarea-scroll-thumb', messageGroup) : null;

        function syncMessageScrollIndicator(textarea) {
            if (!textarea || !messageGroup || !messageScrollIndicator || !messageScrollThumb) return;

            const maxScroll = textarea.scrollHeight - textarea.clientHeight;
            const hasOverflow = maxScroll > 1;
            messageGroup.classList.toggle('is-scrollable', hasOverflow);

            if (!hasOverflow) {
                messageScrollThumb.style.height = '';
                messageScrollThumb.style.transform = 'translateY(0)';
                return;
            }

            const trackHeight = Math.max(messageScrollIndicator.clientHeight, 1);
            const thumbHeight = Math.max(28, Math.round((textarea.clientHeight / textarea.scrollHeight) * trackHeight));
            const maxThumbOffset = Math.max(trackHeight - thumbHeight, 0);
            const thumbOffset = Math.round((textarea.scrollTop / maxScroll) * maxThumbOffset);

            messageScrollThumb.style.height = `${thumbHeight}px`;
            messageScrollThumb.style.transform = `translateY(${thumbOffset}px)`;
        }

        function autoResizeTextarea(textarea) {
            if (!textarea) return;
            textarea.style.height = 'auto';
            const nextHeight = Math.min(textarea.scrollHeight, MESSAGE_MAX_HEIGHT_PX);
            textarea.style.height = `${nextHeight}px`;
            textarea.style.overflowY = textarea.scrollHeight > MESSAGE_MAX_HEIGHT_PX ? 'auto' : 'hidden';
            syncMessageScrollIndicator(textarea);
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
            Object.values(fields).forEach(field => {
                if (!field) return;
                field.removeAttribute('aria-invalid');
            });
        }

        function markFieldError(field) {
            if (!field) return;
            field.setAttribute('aria-invalid', 'true');
        }

        function validateContactForm() {
            clearFieldErrors();
            setFormStatus('', 'info');

            const name = fields.name ? fields.name.value.trim() : '';
            const email = fields.email ? fields.email.value.trim() : '';
            const subject = fields.subject ? fields.subject.value.trim() : '';
            const message = fields.message ? fields.message.value.trim() : '';

            let firstInvalid = null;

            if (!name) {
                markFieldError(fields.name);
                firstInvalid = firstInvalid || fields.name;
            }
            if (!EMAIL_RE.test(email)) {
                markFieldError(fields.email);
                firstInvalid = firstInvalid || fields.email;
            }
            if (!subject) {
                markFieldError(fields.subject);
                firstInvalid = firstInvalid || fields.subject;
            }
            if (!message) {
                markFieldError(fields.message);
                firstInvalid = firstInvalid || fields.message;
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
            fields.message.addEventListener('scroll', () => syncMessageScrollIndicator(fields.message), { passive: true });
            window.addEventListener('resize', () => syncMessageScrollIndicator(fields.message));
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
                callback: (token) => {
                    if (!pendingTurnstileRequest) return;
                    const { resolve, timeoutId } = pendingTurnstileRequest;
                    clearTimeout(timeoutId);
                    pendingTurnstileRequest = null;
                    resolve(token);
                },
                'error-callback': (code) => {
                    if (!pendingTurnstileRequest) return;
                    const { reject, timeoutId } = pendingTurnstileRequest;
                    clearTimeout(timeoutId);
                    pendingTurnstileRequest = null;
                    reject(new Error(`Turnstile challenge failed${code ? ` (${code})` : ''}`));
                },
                'expired-callback': () => {
                    if (turnstileWidgetId !== null) {
                        try {
                            turnstile.reset(turnstileWidgetId);
                        } catch {
                            // Ignore Turnstile reset failures.
                        }
                    }
                }
            });

            return turnstileWidgetId;
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
                    if (!pendingTurnstileRequest) return;
                    pendingTurnstileRequest = null;
                    reject(new Error('Turnstile timed out'));
                }, 10000);

                pendingTurnstileRequest = { resolve, reject, timeoutId };

                try {
                    turnstile.execute(widgetId);
                } catch (err) {
                    clearTimeout(timeoutId);
                    pendingTurnstileRequest = null;
                    reject(err);
                }
            });
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
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Sending...</span><i class="fas fa-spinner fa-spin"></i>';
            contactForm.setAttribute('aria-busy', 'true');
            setFormStatus('Sending your message...', 'info');

            try {
                const turnstileToken = await getTurnstileToken();
                const payload = {
                    name: fields.name ? fields.name.value.trim() : '',
                    email: fields.email ? fields.email.value.trim() : '',
                    subject: fields.subject ? fields.subject.value.trim() : '',
                    message: fields.message ? fields.message.value.trim() : '',
                    honeypot: honeypotField ? honeypotField.value.trim() : '',
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
                submitBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                contactForm.reset();
                autoResizeTextarea(fields.message);
                clearFieldErrors();
                setFormStatus('Message sent successfully! I will get back to you soon.', 'success');
            } catch (err) {
                nextContactSubmitAt = 0;
                setPersistedCooldown(0);

                const apiError = String(err?.apiError || '').trim();
                const rawErrorMessage = String(err?.message || '').trim();
                let friendlyError = CONTACT_ERROR_MESSAGE;
                if (apiError === 'turnstile' || /turnstile/i.test(rawErrorMessage)) {
                    friendlyError = 'Security check failed. Please try again.';
                } else if (apiError === 'server_config') {
                    friendlyError = 'Contact form is temporarily unavailable. Please email contact@cloudwithdavid.com.';
                } else if (apiError === 'email') {
                    friendlyError = 'Message could not be delivered right now. Please try again shortly.';
                }

                if (turnstileWidgetId !== null && window.turnstile && typeof window.turnstile.reset === 'function') {
                    try {
                        window.turnstile.reset(turnstileWidgetId);
                    } catch {
                        // Ignore Turnstile reset failures.
                    }
                }

                if (rawErrorMessage) {
                    console.error('Contact form submit error:', rawErrorMessage);
                }

                setFormStatus(friendlyError, 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHTML;
                submitBtn.style.background = '';
            } finally {
                contactForm.removeAttribute('aria-busy');
            }
        });
    }

    initContactForm();

    // ===========================
    // 15. Notification System
    // ===========================
    function dismissNotification(notif) {
        if (!notif || notif.classList.contains('closing')) return;

        const timerId = Number(notif.dataset.timerId || 0);
        if (timerId) clearTimeout(timerId);

        notif.classList.add('closing');
        notif.addEventListener('animationend', () => notif.remove(), { once: true });
    }

    function showNotification(message, type = 'success', options = {}) {
        const now = Date.now();
        if (now < nextToastAllowedAt) return;
        nextToastAllowedAt = now + TOAST_TRIGGER_COOLDOWN_MS;

        if (!notificationContainer) return;
        const { duration = 4000, contentNode = null } = options;

        const notif = document.createElement('div');
        notif.className = `notification notification--${type}`;

        const notifMessage = document.createElement('span');
        notifMessage.className = 'notification-message';
        if (contentNode instanceof Node) {
            notifMessage.textContent = '';
            notifMessage.appendChild(contentNode);
        } else {
            notifMessage.textContent = message;
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'notification-close';
        closeBtn.setAttribute('aria-label', 'Dismiss notification');
        closeBtn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dismissNotification(notif);
        });

        notif.append(notifMessage, closeBtn);
        notificationContainer.appendChild(notif);

        let remaining = duration;
        let startedAt = 0;

        const startAutoHideTimer = () => {
            if (remaining <= 0 || notif.classList.contains('closing')) return;
            startedAt = Date.now();
            const timerId = setTimeout(() => dismissNotification(notif), remaining);
            notif.dataset.timerId = String(timerId);
        };

        const pauseAutoHideTimer = () => {
            const timerId = Number(notif.dataset.timerId || 0);
            if (!timerId) return;
            clearTimeout(timerId);
            notif.dataset.timerId = '';
            remaining -= Date.now() - startedAt;
            remaining = Math.max(0, remaining);
        };

        notif.addEventListener('mouseenter', pauseAutoHideTimer);
        notif.addEventListener('mouseleave', startAutoHideTimer);
        startAutoHideTimer();

        return notif;
    }

    document.addEventListener('click', (e) => {
        if (!notificationContainer || !notificationContainer.children.length) return;
        if (notificationContainer.contains(e.target)) return;
        if (e.target.closest('[data-toast-trigger]')) return;

        $$('.notification', notificationContainer).forEach(dismissNotification);
    });

    // ===========================
    // 16. Keyboard Navigation
    // ===========================
    document.addEventListener('keydown', (e) => {
        // Tab focus ring
        if (e.key === 'Tab') {
            document.body.classList.add('keyboard-user');
        }
    });

    document.addEventListener('mousedown', () => {
        document.body.classList.remove('keyboard-user');
    });

    // ===========================
    // 18. Completed Badge Sheen Loop
    // ===========================
    function initCompletedBadgeSheenLoop() {
        const badges = $$('.status-complete');
        if (!badges.length) return;

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (reducedMotion.matches) return;

        const parseDurationMs = (rawValue, fallbackMs) => {
            const value = String(rawValue || '').trim();
            if (!value) return fallbackMs;

            if (value.endsWith('ms')) {
                const ms = Number.parseFloat(value.slice(0, -2));
                return Number.isFinite(ms) ? ms : fallbackMs;
            }

            if (value.endsWith('s')) {
                const sec = Number.parseFloat(value.slice(0, -1));
                return Number.isFinite(sec) ? sec * 1000 : fallbackMs;
            }

            const numeric = Number.parseFloat(value);
            return Number.isFinite(numeric) ? numeric * 1000 : fallbackMs;
        };

        const restartSweep = (badge) => {
            badge.classList.remove('is-sweeping');
            void badge.offsetWidth; // force reflow to retrigger CSS animation
            badge.classList.add('is-sweeping');
        };

        const runLoop = (badge, initialDelayMs = 0) => {
            const tick = () => {
                if (!document.body.contains(badge)) return;

                const styles = getComputedStyle(badge);
                const sweepMs = parseDurationMs(styles.getPropertyValue('--complete-sheen-sweep'), 1100);
                const gapMs = parseDurationMs(styles.getPropertyValue('--complete-sheen-gap'), 3200);
                const nextMs = Math.max(150, sweepMs + gapMs);

                restartSweep(badge);
                const timerId = window.setTimeout(tick, nextMs);
                badge.dataset.sheenTimerId = String(timerId);
            };

            const initialTimer = window.setTimeout(tick, initialDelayMs);
            badge.dataset.sheenTimerId = String(initialTimer);
        };

        badges.forEach((badge, index) => {
            const existing = Number(badge.dataset.sheenTimerId || 0);
            if (existing) clearTimeout(existing);
            runLoop(badge, 220 + (index * 120));
        });
    }

    initCompletedBadgeSheenLoop();

    // ===========================
    // 20. Easter Egg Console
    // ===========================
    console.log(
        '%c☁️ Cloud With David',
        'font-size: 2rem; font-weight: bold; color: #4EA0FF; text-shadow: 0 2px 10px rgba(78,160,255,0.3);'
    );
    console.log(
        '%cWhat\'s up! Thanks for checking out my site! If you have any questions or want to connect, feel free to reach out.',
        'font-size: 1rem; color: #00E5FF;'
    );
    console.log(
        '%c🔗 https://linkedin.com/in/cloudwithdavid',
        'font-size: 0.9rem; color: #8FA6CC;'
    );

    // ===========================
    // 21. Performance: Lazy load images
    // ===========================
    function initLazyLoading() {
        const images = $$('img[loading="lazy"]');
        if ('IntersectionObserver' in window) {
            const imgObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                        }
                        imgObserver.unobserve(img);
                    }
                });
            });
            images.forEach(img => imgObserver.observe(img));
        }
    }

    initLazyLoading();

})();
