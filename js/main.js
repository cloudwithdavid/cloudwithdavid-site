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
    const scrollProgress = $('#scrollProgress');
    const backToTop = $('#backToTop');
    const heroCanvas = $('#heroParticles');
    const contactForm = $('#contactForm');
    const notificationContainer = $('#notificationContainer');
    const TOAST_TRIGGER_COOLDOWN_MS = 2000;
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

    if (themeControls.length) {
        themeControls.forEach(control => {
            control.addEventListener('click', (e) => {
                if (e.target.closest('[data-theme-option]')) return;
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

    initTheme();
    maybeShowThemePulse();
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
    // 3c. Credly Scroll Range Glow (Mobile + Tablet)
    // ===========================
    function initCredlyScrollRangeGlow() {
        const credlyLink = $('.proof-link-secondary');
        if (!credlyLink) return;
        const MOBILE_TABLET_MAX_WIDTH = 1024;
        const MOBILE_GLOW_BAND_TOP = 0.18;
        const MOBILE_GLOW_BAND_BOTTOM = 0.60;

        function update() {
            const isMobileTabletViewport = window.innerWidth <= MOBILE_TABLET_MAX_WIDTH;
            if (!isMobileTabletViewport) {
                credlyLink.classList.remove('proof-link-secondary--scroll-glow');
                return;
            }

            // Mobile: glow when the Credly link itself is within a comfortable viewport band.
            const rect = credlyLink.getBoundingClientRect();
            const vh = window.innerHeight || document.documentElement.clientHeight || 0;
            const shouldGlow =
                rect.bottom > vh * MOBILE_GLOW_BAND_TOP &&
                rect.top < vh * MOBILE_GLOW_BAND_BOTTOM;
            credlyLink.classList.toggle('proof-link-secondary--scroll-glow', shouldGlow);
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

    initCredlyScrollRangeGlow();

    // ===========================
    // 3d. Contact Link Scroll Activation (Mobile + Tablet)
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

    // ===========================
    // 5. Smooth Scroll
    // ===========================
    function expandFoundationDropdown() {
        const content = $('#foundationDropdownContent');
        if (!content) return;
        $$('[data-foundation-toggle]').forEach(toggle => {
            toggle.setAttribute('aria-expanded', 'true');
        });
        content.classList.remove('is-collapsed');
    }

    $$('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            const target = $(href);
            if (!target) return;
            e.preventDefault();

            if (href === '#foundation' && this.classList.contains('floating-card')) {
                expandFoundationDropdown();
            }

            const navHeight = navbar ? navbar.offsetHeight : 72;
            const gap = 20;
            const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight - gap;

            window.scrollTo({ top, behavior: 'smooth' });
        });
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
            if (e.target === modal) closeModal();
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
    function initSectionDropdown(toggleSelector, contentSelector) {
        const toggles = $$(toggleSelector);
        const content = $(contentSelector);
        if (!toggles.length || !content) return;

        const setExpanded = (expanded) => {
            toggles.forEach(toggle => {
                toggle.setAttribute('aria-expanded', String(expanded));
            });
            content.classList.toggle('is-collapsed', !expanded);
        };

        const initiallyExpanded = !content.classList.contains('is-collapsed');
        setExpanded(initiallyExpanded);

        toggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const isExpanded = toggles[0].getAttribute('aria-expanded') === 'true';
                const nextExpanded = !isExpanded;
                setExpanded(nextExpanded);
            });
        });
    }

    initSectionDropdown('[data-foundation-toggle]', '#foundationDropdownContent');
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

        triggers.forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const profileUrl = trigger.dataset.profileUrl || 'https://github.com/cloudwithdavid';
                showNotification(
                    `Repo coming soon. <span class="notification-mobile-break">Check out my <a href="${profileUrl}" target="_blank" rel="noopener noreferrer" class="notification-link">GitHub profile</a>.</span>`,
                    'success',
                    { allowHTML: true }
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
                speedX: (Math.random() - 0.5) * 0.3,
                speedY: (Math.random() - 0.5) * 0.3,
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
        const heroVisual = $('.hero-visual');
        if (!heroVisual) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let ticking = false;
        const getParallaxFactor = () => {
            const viewportWidth = window.innerWidth;
            if (viewportWidth <= 768) return 0.05;
            if (viewportWidth <= 1024) return 0.06;
            return 0.075;
        };

        const updateParallax = () => {
            const scrolled = window.pageYOffset;
            const parallaxFactor = getParallaxFactor();
            const clampedScroll = Math.min(scrolled, window.innerHeight);
            const offsetY = -(clampedScroll * parallaxFactor);
            heroVisual.style.transform = `translateY(${offsetY.toFixed(2)}px)`;
        };

        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;

            requestAnimationFrame(() => {
                updateParallax();
                ticking = false;
            });
        }, { passive: true });

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
        let nextContactSubmitAt = 0;
        let turnstileWidgetId = null;
        let pendingTurnstileRequest = null;

        const fields = {
            name: $('#name', contactForm),
            email: $('#email', contactForm),
            subject: $('#subject', contactForm),
            message: $('#message', contactForm)
        };

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
        const { allowHTML = false, duration = 4000 } = options;

        const notif = document.createElement('div');
        notif.className = `notification notification--${type}`;

        const notifMessage = document.createElement('span');
        notifMessage.className = 'notification-message';
        if (allowHTML) {
            notifMessage.innerHTML = message;
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
    // 18. Typing Effect (Hero badge area)
    // ===========================
    // Adds a subtle typewriter indicator to the "loading" badge
    function initLoadingBadge() {
        const loader = $('.hero-badge--loading');
        if (!loader) return;

        const text = loader.querySelector('span:last-child');
        if (!text) return;

        const original = text.textContent.replace(/\.+$/, '').trim();
        const dots = ['', '.', '..', '...'];
        const dotsEl = document.createElement('span');
        dotsEl.className = 'hero-loading-dots';
        dotsEl.setAttribute('aria-hidden', 'true');

        text.textContent = original;
        text.appendChild(dotsEl);

        let i = 0;

        setInterval(() => {
            // Only animate when in viewport
            const rect = loader.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                dotsEl.textContent = dots[i % dots.length];
                i++;
            }
        }, 600);
    }

    initLoadingBadge();

    // ===========================
    // 19. Completed Badge Sheen Loop
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
