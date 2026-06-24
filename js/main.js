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
    const themeControls = $$('[data-theme-segmented]');
    const themeSegments = $$('[data-theme-option]');
    const themeToggles = $$('[data-theme-toggle]');
    const themeToggleIcons = $$('[data-theme-toggle-icon]');
    const scrollProgress = $('#scrollProgress');
    const contactForm = $('#contactForm');
    const DEPLOY_BEACON_FLAG_PARAM = 'deploy';
    const DEPLOY_BEACON_FLAG_VALUE = 'key';
    const DEPLOY_BEACON_START = 0;
    const DEPLOY_BEACON_COUNTER_KEY = 'cwd-deploy-beacon-counter';
    const DEPLOY_BEACON_LAST_VERSION_KEY = 'cwd-deploy-beacon-last-version';
    const THEME_STORAGE_KEY = 'cwd-theme';
    const SKILLS_SPOTLIGHT_CLASS = 'skills-card--spotlight';
    const SKILLS_SPOTLIGHT_DURATION = 2800;
    const skillsSpotlightTimers = new WeakMap();
    const scrollFrameHandlers = [];
    const resizeFrameHandlers = [];
    let scrollFrameQueued = false;
    let resizeFrameQueued = false;

    function runFrameHandlers(handlers) {
        handlers.forEach(handler => handler());
    }

    function registerViewportHandler(handler, { scroll = false, resize = false, run = false } = {}) {
        if (scroll) scrollFrameHandlers.push(handler);
        if (resize) resizeFrameHandlers.push(handler);
        if (run) handler();
    }

    window.addEventListener('scroll', () => {
        if (scrollFrameQueued) return;
        scrollFrameQueued = true;
        requestAnimationFrame(() => {
            scrollFrameQueued = false;
            runFrameHandlers(scrollFrameHandlers);
        });
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (resizeFrameQueued) return;
        resizeFrameQueued = true;
        requestAnimationFrame(() => {
            resizeFrameQueued = false;
            runFrameHandlers(resizeFrameHandlers);
        });
    }, { passive: true });

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

    function initTheme() {
        const previewTheme = getThemePreviewOverride();
        if (previewTheme) {
            applyTheme(previewTheme, { persist: false });
            return;
        }

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
        if (getThemePreviewOverride()) return;
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
    initDeployBeacon();

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
    function updateScrollState() {
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

    }

    registerViewportHandler(updateScrollState, { scroll: true, resize: true, run: true });

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

        registerViewportHandler(update, { scroll: true, resize: true, run: true });
    }

    initContactLinkScrollActivation();

    // ===========================
    // 4. Active Nav Link Tracking
    // ===========================
    const ACTIVE_NAV_SCROLL_OFFSET = 24;

    function updateActiveNav() {
        const sections = $$('.page-section[id]');
        const navHeight = navbar ? navbar.offsetHeight : 72;
        const scrollY = window.pageYOffset + navHeight + ACTIVE_NAV_SCROLL_OFFSET;

        let currentId = '';

        sections.forEach(section => {
            const top = section.getBoundingClientRect().top + window.pageYOffset;
            if (scrollY >= top) {
                currentId = section.id;
            }
        });

        $$('.nav-links a').forEach(link => {
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
        anchor.addEventListener('click', async function (e) {
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
                        scrollToAnchorTarget(target, floatingCardOffset);
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
            modal.classList.remove('is-open');
            modal.classList.remove('cert-modal--image');
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

            let mediaEl;
            modal.classList.toggle('cert-modal--image', modalType === 'image');

            const img = document.createElement('img');
            img.src = src;
            img.alt = `${pill.textContent.trim()} credential`;
            img.loading = 'lazy';
            mediaEl = img;
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
    // 8. Stats Counter Animation
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
    // 9. Hero Visual Parallax
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

        registerViewportHandler(updateParallax, { scroll: true, resize: true, run: true });
    }

    initHeroVisualParallax();

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
            registerViewportHandler(() => syncMessageScrollIndicator(fields.message), { resize: true });
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
    // 11. Keyboard Navigation
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
    // 12. Easter Egg Console
    // ===========================
    console.log(
        '%câï¸ Cloud With David',
        'font-size: 2rem; font-weight: bold; color: #4EA0FF; text-shadow: 0 2px 10px rgba(78,160,255,0.3);'
    );
    console.log(
        '%cWhat\'s up! Thanks for checking out my site! If you have any questions or want to connect, feel free to reach out.',
        'font-size: 1rem; color: #00E5FF;'
    );
    console.log(
        '%cð https://linkedin.com/in/cloudwithdavid',
        'font-size: 0.9rem; color: #8FA6CC;'
    );

})();
