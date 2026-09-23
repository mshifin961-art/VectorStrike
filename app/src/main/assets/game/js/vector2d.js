/**
 * Vector Strike - 2D Vector Math Library
 * High-performance, allocation-friendly 2D vector utility.
 */
class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    copy(v) {
        this.x = v.x;
        this.y = v.y;
        return this;
    }

    clone() {
        return new Vec2(this.x, this.y);
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    addScaled(v, s) {
        this.x += v.x * s;
        this.y += v.y * s;
        return this;
    }

    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    mul(s) {
        this.x *= s;
        this.y *= s;
        return this;
    }

    div(s) {
        if (s !== 0) {
            this.x /= s;
            this.y /= s;
        }
        return this;
    }

    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    cross(v) {
        return this.x * v.y - this.y * v.x;
    }

    magSq() {
        return this.x * this.x + this.y * this.y;
    }

    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const m = this.mag();
        if (m > 0.00001) {
            this.x /= m;
            this.y /= m;
        } else {
            this.x = 0;
            this.y = 0;
        }
        return this;
    }

    distSq(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return dx * dx + dy * dy;
    }

    dist(v) {
        return Math.sqrt(this.distSq(v));
    }

    angle() {
        return Math.atan2(this.y, this.x);
    }

    lerp(v, t) {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        return this;
    }

    clamp(minVal, maxVal) {
        this.x = Math.max(minVal, Math.min(maxVal, this.x));
        this.y = Math.max(minVal, Math.min(maxVal, this.y));
        return this;
    }

    static fromAngle(rad, length = 1) {
        return new Vec2(Math.cos(rad) * length, Math.sin(rad) * length);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Vec2;
}
