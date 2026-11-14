const Intro = {
    // Input right after freezing is ignored, so one press (double-click, a key that sends two
    // events) cannot skip the frozen last frame too.
    lock: 0.5,

    play(done) {
        this.screen = document.getElementById('introScreen');
        this.video = document.getElementById('introVideo');
        this.still = document.getElementById('introStill');
        this.sound = document.getElementById('introSound');
        this.hint = document.getElementById('introHint');
        this.done = done;
        this.phase = 'video';

        this.skip = e => {
            if (e && e.repeat) {
                return;
            }
            if (this.phase === 'video') {
                this.showStill();
            } else if (this.phase === 'still' && performance.now() - this.stillAt > this.lock * 1000) {
                this.finish();
            }
        };
        this.unmute = e => {
            e.stopPropagation();
            this.video.muted = false;
            this.sound.hidden = true;
        };
        this.ended = () => this.showStill();
        this.failed = () => this.showStill();

        addEventListener('keydown', this.skip);
        this.screen.addEventListener('pointerdown', this.skip);
        this.sound.addEventListener('pointerdown', this.unmute);
        this.video.addEventListener('ended', this.ended);
        this.video.addEventListener('error', this.failed);

        this.video.muted = false;
        this.video.play().catch(() => {
            if (this.phase !== 'video') {
                return;
            }
            this.video.muted = true;
            this.sound.hidden = false;
            this.video.play().catch(this.failed);
        });
    },

    showStill() {
        if (this.phase !== 'video') {
            return;
        }
        this.phase = 'still';
        this.stillAt = performance.now();
        this.video.pause();
        this.still.hidden = false;
        this.sound.hidden = true;
        this.hint.textContent = 'Press any key to continue';
    },

    finish() {
        if (this.phase === 'done') {
            return;
        }
        this.phase = 'done';
        removeEventListener('keydown', this.skip);
        this.screen.removeEventListener('pointerdown', this.skip);
        this.sound.removeEventListener('pointerdown', this.unmute);
        this.video.removeEventListener('ended', this.ended);
        this.video.removeEventListener('error', this.failed);
        this.screen.classList.add('out');
        this.done();
        setTimeout(() => {
            this.screen.hidden = true;
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
        }, 500);
    }
};
