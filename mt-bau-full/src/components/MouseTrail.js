// Mouse trail effect with colorful lines
let ctx, f, e = 0, pos = {}, lines = [];

const E = {
    friction: 0.5,
    trails: 20,
    size: 50,
    dampening: 0.25,
    tension: 0.98,
};

class Wave {
    constructor(config = {}) {
        this.phase = config.phase || 0;
        this.offset = config.offset || 0;
        this.frequency = config.frequency || 0.001;
        this.amplitude = config.amplitude || 1;
    }

    update() {
        this.phase += this.frequency;
        e = this.offset + Math.sin(this.phase) * this.amplitude;
        return e;
    }

    value() {
        return e;
    }
}

class Node {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vy = 0;
        this.vx = 0;
    }
}

class Line {
    constructor(config = {}) {
        this.spring = config.spring + 0.1 * Math.random() - 0.02;
        this.friction = E.friction + 0.01 * Math.random() - 0.005;
        this.nodes = [];

        for (let i = 0; i < E.size; i++) {
            const node = new Node();
            node.x = pos.x;
            node.y = pos.y;
            this.nodes.push(node);
        }
    }

    update() {
        let spring = this.spring;
        let node = this.nodes[0];

        node.vx += (pos.x - node.x) * spring;
        node.vy += (pos.y - node.y) * spring;

        for (let i = 0; i < this.nodes.length; i++) {
            node = this.nodes[i];

            if (i > 0) {
                const prev = this.nodes[i - 1];
                node.vx += (prev.x - node.x) * spring;
                node.vy += (prev.y - node.y) * spring;
                node.vx += prev.vx * E.dampening;
                node.vy += prev.vy * E.dampening;
            }

            node.vx *= this.friction;
            node.vy *= this.friction;
            node.x += node.vx;
            node.y += node.vy;
            spring *= E.tension;
        }
    }

    draw() {
        let x = this.nodes[0].x;
        let y = this.nodes[0].y;

        ctx.beginPath();
        ctx.moveTo(x, y);

        for (let i = 1; i < this.nodes.length - 2; i++) {
            const node = this.nodes[i];
            const next = this.nodes[i + 1];
            x = 0.5 * (node.x + next.x);
            y = 0.5 * (node.y + next.y);
            ctx.quadraticCurveTo(node.x, node.y, x, y);
        }

        const last = this.nodes[this.nodes.length - 2];
        const end = this.nodes[this.nodes.length - 1];
        ctx.quadraticCurveTo(last.x, last.y, end.x, end.y);
        ctx.stroke();
        ctx.closePath();
    }
}

function onMousemove(event) {
    function initLines() {
        lines = [];
        for (let i = 0; i < E.trails; i++) {
            lines.push(new Line({ spring: 0.4 + (i / E.trails) * 0.025 }));
        }
    }

    function updatePosition(e) {
        if (e.touches) {
            pos.x = e.touches[0].pageX;
            pos.y = e.touches[0].pageY;
        } else {
            pos.x = e.clientX;
            pos.y = e.clientY;
        }
        e.preventDefault();
    }

    document.removeEventListener('mousemove', onMousemove);
    document.removeEventListener('touchstart', onMousemove);
    document.addEventListener('mousemove', updatePosition);
    document.addEventListener('touchmove', updatePosition);
    document.addEventListener('touchstart', updatePosition);

    updatePosition(event);
    initLines();
    render();
}

function render() {
    if (ctx.running) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `hsla(${Math.round(f.update())}, 90%, 50%, 0.25)`;
        ctx.lineWidth = 1;

        for (let i = 0; i < E.trails; i++) {
            const line = lines[i];
            line.update();
            line.draw();
        }

        ctx.frame++;
        window.requestAnimationFrame(render);
    }
}

function resizeCanvas() {
    ctx.canvas.width = window.innerWidth;
    ctx.canvas.height = window.innerHeight;
}

export const renderCanvas = () => {
    const canvas = document.getElementById('mouse-trail-canvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    ctx.running = true;
    ctx.frame = 1;

    f = new Wave({
        phase: Math.random() * 2 * Math.PI,
        amplitude: 85,
        frequency: 0.0015,
        offset: 200,
    });

    document.addEventListener('mousemove', onMousemove);
    document.addEventListener('touchstart', onMousemove);
    window.addEventListener('resize', resizeCanvas);

    window.addEventListener('focus', () => {
        if (!ctx.running) {
            ctx.running = true;
            render();
        }
    });

    window.addEventListener('blur', () => {
        ctx.running = false;
    });

    resizeCanvas();
};
