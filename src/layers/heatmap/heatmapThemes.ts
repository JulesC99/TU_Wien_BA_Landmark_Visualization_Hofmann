
/** Simple/global ramp (white→yellow→orange→red→purple) */
export const SIMPLE_HEATMAP_COLORS = [
  '#ffffff', // white ffffffff
  '#ffff00', // yellow
  '#ffa500', // orange
  '#ff0000', // red
  '#800080', // purple
] as const;


/** Category palettes (5 stops each) for the categorized heatmap. */
export const CATEGORIZED_HEATMAP_PALETTES: Readonly<Record<string, readonly [string, string, string, string, string]>> = {
  default: ['rgba(180,160,20,0)', 'rgb(180,160,20)', 'rgb(220,200,60)', 'rgb(245,230,140)', 'rgb(255,250,200)'],
  fooddrink: ['rgba(180,60,20,0)', 'rgb(180,60,20)', 'rgb(220,100,40)', 'rgb(240,150,90)', 'rgb(255,200,150)'],
  amenity: ['rgba(40,80,160,0)', 'rgb(40,80,160)', 'rgb(80,130,200)', 'rgb(140,180,230)', 'rgb(200,220,245)'],
  emergency: ['rgba(150,20,20,0)', 'rgb(150,20,20)', 'rgb(200,40,40)', 'rgb(230,100,100)', 'rgb(255,170,170)'],
  accommodation: ['rgba(90,30,130,0)', 'rgb(90,30,130)', 'rgb(130,60,160)', 'rgb(170,110,200)', 'rgb(210,170,230)'],
  tourism: ['rgba(100,30,90,0)', 'rgb(100,30,90)', 'rgb(160,50,120)', 'rgb(200,120,180)', 'rgb(235,180,220)'],
  shop: ['rgba(20,100,80,0)', 'rgb(20,100,80)', 'rgb(40,150,130)', 'rgb(90,200,170)', 'rgb(160,230,210)'],
  settlement: ['rgba(160,100,20,0)', 'rgb(160,100,20)', 'rgb(210,150,40)', 'rgb(235,190,100)', 'rgb(250,220,160)'],
  nature: ['rgba(20,120,20,0)', 'rgb(20,120,20)', 'rgb(56,155,80)', 'rgb(120,200,120)', 'rgb(170,225,170)'],
  transportation: ['rgba(100,100,20,0)', 'rgb(100,100,20)', 'rgb(150,150,60)', 'rgb(200,200,120)', 'rgb(230,230,180)'],
  infrastructure: ['rgba(60,60,60,0)', 'rgb(60,60,60)', 'rgb(120,120,120)', 'rgb(170,170,170)', 'rgb(210,210,210)'],
  building: ['rgba(20,40,90,0)', 'rgb(20,40,90)', 'rgb(50,80,140)', 'rgb(120,150,200)', 'rgb(180,200,240)'],
} as const;

export function getCategorizedPalette(name?: string) {
  return CATEGORIZED_HEATMAP_PALETTES[name ?? 'default'] ?? CATEGORIZED_HEATMAP_PALETTES.default;
}