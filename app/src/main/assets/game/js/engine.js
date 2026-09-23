
    renderCharacter(ctx, c) {
        ctx.save();
        ctx.translate(c.pos.x, c.pos.y);

        // Alpha opacity for Cloak
        if (c.isCloaked) {
            ctx.globalAlpha = 0.25;
        }

        // Invincibility flashing
        if (c.invincibleTimer > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        }

        const classDef = c.classDef || {
            primaryColor: '#00e5ff',
            secondaryColor: '#1a2639',
            visorColor: '#00ffff'
        };
        const halfW = (Number.isFinite(c.width) ? c.width : 24) * 0.5;
        const halfH = (Number.isFinite(c.height) ? c.height : 46) * 0.5;
        const facing = c.facing === -1 ? -1 : 1;

        // Facing direction scale
        ctx.scale(facing, 1);

        // 1. Cybernetic Legs
        ctx.fillStyle = '#151d2a';
        ctx.fillRect(-6, 8, 4, 14);
        ctx.fillRect(2, 8, 4, 14);

        // 2. Torso Armor Plate
        ctx.fillStyle = classDef.secondaryColor || '#1a2639';
        ctx.fillRect(-halfW + 2, -halfH + 12, c.width - 4, 20);

        // Team indicator chest core
        ctx.fillStyle = (c.team === 'ALPHA') ? '#00e5ff' : '#ff0055';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        ctx.fillRect(-3, -halfH + 16, 6, 6);
        ctx.shadowBlur = 0;