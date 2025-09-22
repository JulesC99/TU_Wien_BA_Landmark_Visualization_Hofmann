type JumpConfig = { id: string; center: [number, number]; zoom: number; durationMs?: number };

const JUMP_TARGETS: JumpConfig[] = [
    { id: "jump-1", center: [12.1533345492075, 47.40317327392543], zoom: 14 },
    { id: "jump-2", center: [12.290556149959428, 47.52448802575202], zoom: 14 },
    { id: "jump-3", center: [14.261970424553027, 48.10880668294797], zoom: 14 },
];

export function installLocationJumpControls(map: mapboxgl.Map) {
    for (const { id, center, durationMs } of JUMP_TARGETS) {
        const btn = document.getElementById(id) as HTMLButtonElement | null;
        if (!btn) continue;

        btn.addEventListener("click", () => {
            map.panTo(center, { duration: durationMs ?? 800 });
        });
    }
}