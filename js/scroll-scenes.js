/* Desktop scroll chapters. Native scrolling remains the only input. */
(() => {
    'use strict';

    const scenes = [...document.querySelectorAll('[data-scroll-scene]')].map(section => ({
        section,
        stage: section.querySelector('.scroll-stage'),
        heading: section.querySelector('.projects-heading'),
        viewport: section.querySelector('.scene-viewport'),
        track: section.querySelector('.scene-track'),
        portrait: section.querySelector('.about-portrait'),
        portraitCaption: section.querySelector('.about-portrait-caption'),
        biography: section.querySelector('.about-biography'),
        details: section.querySelector('.about-details'),
        horizontal: section.dataset.scrollScene === 'horizontal',
        active: false, start: 0, distance: 0, duration: 0,
        intro: 0, tail: 0, outro: 0, horizontalDuration: 0, viewportInset: 0
    }));
    const desktop = window.matchMedia('(min-width: 800px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nav = document.getElementById('navbar');
    let enabled = false;
    let frame = 0;
    let lastScrollY = window.scrollY;
    let measuredWidth = window.innerWidth;
    let measuredHeight = window.innerHeight;
    const clamp = (value, max = 1) => Math.max(0, Math.min(max, value));

    function render() {
        frame = 0;
        if (!enabled) return;
        // A resize can emit a scroll event before its measurement frame.
        // Keep the last painted position until the new geometry is ready.
        if (window.innerWidth !== measuredWidth || window.innerHeight !== measuredHeight) return;
        const scroll = window.scrollY;
        scenes.forEach(scene => {
            if (!scene.active) return;
            const elapsed = clamp(scroll - scene.start, scene.duration);
            const progress = elapsed / scene.duration;
            let x = 0;
            let y = -scene.distance * progress;
            if (scene.horizontal) {
                const across = clamp((elapsed - scene.intro) / scene.horizontalDuration);
                x = -scene.distance * across;
                // Every panel fits before the horizontal enhancement activates.
                y = 0;
                // Each outer panel travels to the padded content edge independently.
                // Its travel never dictates the reading width or column gaps.
                scene.portrait.style.transform = `translate3d(${-scene.portraitExit * across}px, 0, 0)`;
                // Both text columns keep the same top edge during the reveal.
                scene.details.style.transform = `translate3d(${scene.detailsEntry * (1 - across)}px, 0, 0)`;
            }
            scene.track.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            scene.section.classList.toggle('is-moving', progress > 0 && progress < 1);
        });
        lastScrollY = scroll;
    }

    function scheduleRender() {
        if (!frame) frame = requestAnimationFrame(render);
    }

    function measure() {
        const pinned = scenes.find(scene => scene.active && lastScrollY >= scene.start && lastScrollY <= scene.start + scene.duration);
        let bookmark;
        if (pinned) {
            const elapsed = lastScrollY - pinned.start;
            const phase = !pinned.horizontal ? 'vertical' : elapsed < pinned.intro ? 'intro'
                : elapsed <= pinned.intro + pinned.horizontalDuration ? 'across'
                : elapsed <= pinned.intro + pinned.horizontalDuration + pinned.tail ? 'tail' : 'outro';
            const offset = phase === 'across' ? pinned.intro
                : phase === 'tail' ? pinned.intro + pinned.horizontalDuration
                : phase === 'outro' ? pinned.intro + pinned.horizontalDuration + pinned.tail : 0;
            const duration = phase === 'vertical' ? pinned.duration : phase === 'across' ? pinned.horizontalDuration : pinned[phase];
            bookmark = { scene: pinned, phase, progress: clamp((elapsed - offset) / Math.max(1, duration)) };
        }
        enabled = desktop.matches && !reducedMotion.matches;
        scenes.forEach(scene => {
            scene.active = enabled;
            scene.section.classList.toggle('is-scroll-scene', enabled);
            scene.section.classList.remove('is-moving', 'has-vertical-pan', 'is-about-compact', 'is-about-flow');
            scene.section.style.removeProperty('--about-scale');
            scene.section.style.removeProperty('height');
            scene.track.style.removeProperty('transform');
            scene.intro = 0;
            scene.tail = 0;
            scene.outro = 0;
            scene.portrait?.style.removeProperty('transform');
            scene.details?.style.removeProperty('transform');
            if (!enabled) return;
            if (scene.horizontal) {
                const styles = getComputedStyle(scene.section);
                const viewportWidth = scene.viewport.clientWidth;
                const biographyMax = parseFloat(styles.getPropertyValue('--about-biography-max')) || 640;
                const portraitMax = parseFloat(styles.getPropertyValue('--about-portrait-max')) || 480;
                const columnGap = parseFloat(styles.getPropertyValue('--gap-columns')) || 32;
                // Use the whole section frame for the final reading view.
                // Only the prose and portrait have individual size limits.
                const aboutGap = Math.round(Math.max(48, Math.min(96, viewportWidth * .075)));
                const biographyWidth = Math.min(biographyMax, Math.round((viewportWidth - aboutGap) * .53));
                const focusWidth = viewportWidth - aboutGap - biographyWidth;
                const portraitWidth = Math.min(focusWidth, portraitMax);
                scene.section.style.setProperty('--about-gap', `${aboutGap}px`);
                scene.section.style.setProperty('--portrait-width', `${portraitWidth}px`);
                scene.section.style.setProperty('--biography-width', `${biographyWidth}px`);
                scene.section.style.setProperty('--focus-width', `${focusWidth}px`);
                const fits = scale => {
                    scene.section.style.setProperty('--about-scale', scale);
                    const captionStyles = getComputedStyle(scene.portraitCaption);
                    const captionHeight = scene.portraitCaption.getBoundingClientRect().height
                        + parseFloat(captionStyles.marginTop) + parseFloat(captionStyles.marginBottom);
                    return Math.max(scene.biography.scrollHeight, scene.details.scrollHeight,
                        captionHeight + 96) <= scene.viewport.clientHeight - 2;
                };
                if (!fits(1)) {
                    if (!fits(.65)) {
                        // Keep readable type and all content in ordinary flow
                        // when a two-column presentation cannot fit the window.
                        scene.active = false;
                        scene.section.classList.remove('is-scroll-scene');
                        scene.section.classList.add('is-about-flow');
                        scene.section.style.removeProperty('--about-scale');
                        return;
                    }
                    let low = .65, high = 1;
                    for (let step = 0; step < 9; step++) {
                        const scale = (low + high) / 2;
                        if (fits(scale)) low = scale;
                        else high = scale;
                    }
                    fits(low);
                }
                // Reserve the availability and education caption before sizing
                // the image. The caption keeps the full column's reading width.
                const captionStyles = getComputedStyle(scene.portraitCaption);
                const captionHeight = scene.portraitCaption.getBoundingClientRect().height
                    + parseFloat(captionStyles.marginTop) + parseFloat(captionStyles.marginBottom);
                const imageSpace = Math.floor(scene.viewport.clientHeight - captionHeight);
                const imageHeight = Math.min(portraitWidth * 1.25, imageSpace);
                scene.section.style.setProperty('--about-portrait-height', `${imageHeight}px`);
                scene.distance = portraitWidth + aboutGap;
                scene.portraitExit = 0;
                scene.detailsEntry = Math.max(0, viewportWidth + columnGap - (portraitWidth + biographyWidth + aboutGap * 2));
                scene.intro = Math.round(Math.max(160, Math.min(240, scene.viewport.clientHeight * .35)) / 2) * 2;
                scene.outro = scene.intro / 2;
                scene.horizontalDuration = scene.distance * 2.2;
            } else {
                scene.viewportInset = parseFloat(getComputedStyle(scene.viewport).paddingTop) || 0;
                // Paired projects use their own content height instead of
                // inheriting the large featured project's image height.
                [...scene.track.children].forEach(row => {
                    const rowHeight = Math.max(...[...row.querySelectorAll('.project-card')].map(card => {
                        const styles = getComputedStyle(card);
                        const detailsHeight = card.querySelector('.project-details').offsetHeight;
                        const imageHeight = card.querySelector('.project-cover-link').offsetHeight;
                        const contentHeight = styles.display === 'flex' && styles.flexDirection === 'column'
                            ? imageHeight + detailsHeight + (parseFloat(styles.rowGap) || 0)
                            : Math.max(imageHeight, detailsHeight);
                        return contentHeight + parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
                            + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
                    }));
                    row.style.setProperty('--project-row-height', `${Math.ceil(rowHeight)}px`);
                });
                scene.distance = Math.max(0, scene.track.scrollHeight + scene.viewportInset - scene.viewport.clientHeight);
            }
            scene.duration = Math.max(1, scene.horizontal
                ? scene.intro + scene.horizontalDuration + scene.tail + scene.outro
                : scene.distance * 1.4);
            scene.section.style.height = `${(scene.heading?.offsetHeight || 0) + scene.stage.offsetHeight + scene.duration}px`;
        });
        // Measure positions only after both chapters have their final heights.
        scenes.forEach(scene => {
            scene.start = scene.section.getBoundingClientRect().top + window.scrollY
                + (scene.heading?.offsetHeight || 0) - (nav?.offsetHeight || 80);
        });
        measuredWidth = window.innerWidth;
        measuredHeight = window.innerHeight;
        if (bookmark?.scene.active) {
            const { scene, phase, progress } = bookmark;
            const elapsed = phase === 'intro' ? progress * scene.intro
                : phase === 'across' ? scene.intro + progress * scene.horizontalDuration
                : phase === 'tail' ? scene.intro + scene.horizontalDuration + progress * scene.tail
                : phase === 'outro' ? scene.intro + scene.horizontalDuration + scene.tail + progress * scene.outro
                : progress * scene.duration;
            window.scrollTo({ top: scene.start + elapsed, behavior: 'instant' });
        }
        render();
    }

    // Tabbing into content beyond the clipped stage brings its row/panel into view.
    scenes.forEach(scene => scene.track.addEventListener('focusin', event => {
        if (!enabled || !scene.active) return;
        const target = event.target.getBoundingClientRect();
        const viewport = scene.viewport.getBoundingClientRect();
        const outside = target.left < viewport.left || target.right > viewport.right
            || target.top < viewport.top || target.bottom > viewport.bottom;
        if (!outside) return;
        const panel = scene.horizontal
            ? event.target.closest('.about-rail > *')
            : event.target.closest('.project-row');
        if (!panel) return;
        const bounds = panel.getBoundingClientRect();
        const track = scene.track.getBoundingClientRect();
        const offset = scene.horizontal ? bounds.left - track.left : bounds.top - track.top;
        const progress = clamp(offset / scene.distance);
        let elapsed = progress * scene.duration;
        if (scene.horizontal) {
            const below = clamp(target.bottom - bounds.top - scene.viewport.clientHeight, scene.tail);
            elapsed = scene.intro + scene.horizontalDuration + below;
        }
        window.scrollTo({ top: scene.start + elapsed, behavior: 'instant' });
        render();
    }));

    window.addEventListener('scroll', scheduleRender, { passive: true });
    let resizeFrame = 0;
    function scheduleMeasure() {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(measure);
    }
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    if ('ResizeObserver' in window) {
        const copyObserver = new ResizeObserver(scheduleMeasure);
        scenes.forEach(scene => {
            if (scene.portraitCaption) copyObserver.observe(scene.portraitCaption);
            if (scene.biography) copyObserver.observe(scene.biography);
            if (scene.details) copyObserver.observe(scene.details);
        });
    }
    desktop.addEventListener('change', measure);
    reducedMotion.addEventListener('change', measure);
    window.addEventListener('pageshow', measure);
    measure();
    document.fonts?.ready.then(measure);

    const hero = document.getElementById('hero');
    if (hero && 'IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            hero.classList.toggle('is-offscreen', !entry.isIntersecting);
        }).observe(hero);
    }
})();
