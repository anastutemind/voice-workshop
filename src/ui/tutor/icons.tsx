/** The tutor's icons: thin line drawings on a 24-unit grid, in the colour of the text around them. */
import type { ReactNode } from 'react';

const Svg = ({ children, size = 20, fill = false }: { children: ReactNode; size?: number; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
type P = { size?: number };

export const IconPlay = (p: P) => <Svg {...p} fill><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11.3-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2Z" /></Svg>;
export const IconPause = (p: P) => <Svg {...p} fill><rect x="6" y="4.5" width="4.2" height="15" rx="1.2" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" /></Svg>;
export const IconStop = (p: P) => <Svg {...p} fill><rect x="6" y="6" width="12" height="12" rx="2.4" /></Svg>;
export const IconSpeaker = (p: P) => <Svg {...p}><path d="M4 9.5v5h3.2l4.3 3.6V5.9L7.2 9.5H4Z" /><path d="M15.2 9.2a4 4 0 0 1 0 5.6" /><path d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" /></Svg>;
export const IconSpeakerOff = (p: P) => <Svg {...p}><path d="M4 9.5v5h3.2l4.3 3.6V5.9L7.2 9.5H4Z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></Svg>;
export const IconSlow = (p: P) => <Svg {...p}><path d="M4.5 16a7.5 7.5 0 1 1 15 0" /><path d="m12 16-4.2-3.2" /><path d="M4.5 16h15" /></Svg>;
export const IconMic = (p: P) => <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v3" /></Svg>;
export const IconChevronLeft = (p: P) => <Svg {...p}><path d="m14.5 5-7 7 7 7" /></Svg>;
export const IconChevronRight = (p: P) => <Svg {...p}><path d="m9.5 5 7 7-7 7" /></Svg>;
export const IconStepBack = (p: P) => <Svg {...p} fill><path d="M17.5 5.6v12.8a.8.8 0 0 1-1.24.67L7.5 13v5.2a1 1 0 0 1-2 0V5.8a1 1 0 0 1 2 0V11l8.76-6.07a.8.8 0 0 1 1.24.67Z" /></Svg>;
export const IconStepForward = (p: P) => <Svg {...p} fill><path d="M6.5 5.6v12.8a.8.8 0 0 0 1.24.67L16.5 13v5.2a1 1 0 0 0 2 0V5.8a1 1 0 0 0-2 0V11L7.74 4.93a.8.8 0 0 0-1.24.67Z" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="m5 12.5 4.6 4.6L19 7.5" /></Svg>;
export const IconCross = (p: P) => <Svg {...p}><path d="m6.5 6.5 11 11M17.5 6.5l-11 11" /></Svg>;
export const IconUnknown = (p: P) => <Svg {...p}><path d="M9.2 9.2a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.1-1.5 2.1" /><path d="M12 17.4v.2" /></Svg>;
export const IconLesson = (p: P) => <Svg {...p}><path d="m3 9 9-4.5L21 9l-9 4.5L3 9Z" /><path d="M7 11.2V16c1.4 1.3 3.1 2 5 2s3.6-.7 5-2v-4.8" /><path d="M21 9v5" /></Svg>;
export const IconName = (p: P) => <Svg {...p}><path d="M4.5 18 9 6l4.5 12" /><path d="M6.2 14h5.6" /><path d="M15.5 12.4c.6-.9 1.5-1.4 2.6-1.4 1.6 0 2.4 1 2.4 2.5V18" /><path d="M20.500 14.600c-2.900 0-4.700.600-4.700 2s1 1.600 2 1.600c1.400 0 2.700-.900 2.700-2.400" /></Svg>;
export const IconWord = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="m3.800 16 4.700-4.500 3.500 3.300 2.500-2.300 5.700 5" /><circle cx="15.500" cy="9.300" r="1.300" /></Svg>;
export const IconLips = (p: P) => <Svg {...p}><path d="M3 12c2.200-2.700 4.300-4.500 6-4.500 1.200 0 2 .8 3 .8s1.800-.8 3-.8c1.700 0 3.800 1.800 6 4.500-2.500 3-5.500 4.800-9 4.800S5.500 15 3 12Z" /><path d="M3 12h18" /></Svg>;
export const IconTongue = (p: P) => <Svg {...p}><path d="M4 8.500h16" /><path d="M8 8.500v5.700a4 4 0 0 0 8 0V8.500" /><path d="M12 11v4" /></Svg>;
export const IconAir = (p: P) => <Svg {...p}><path d="M3.500 9h10.200a2.600 2.600 0 1 0-2.500-3.300" /><path d="M3.500 13h14.700a2.600 2.600 0 1 1-2.500 3.300" /><path d="M3.500 17h6" /></Svg>;
export const IconVoice = (p: P) => <Svg {...p}><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.500v3" /></Svg>;
export const IconIdea = (p: P) => <Svg {...p}><path d="M8.500 14.200A5.800 5.800 0 1 1 15.500 14.200c-.700.600-1 1.300-1 2.100H9.500c0-.800-.300-1.500-1-2.100Z" /><path d="M10 19.500h4" /></Svg>;
export const IconLayers = (p: P) => <Svg {...p}><path d="m12 4 8.500 4.500L12 13 3.500 8.500 12 4Z" /><path d="m4.500 12.500 7.500 4 7.500-4" /><path d="m4.500 16 7.500 4 7.500-4" /></Svg>;
export const IconFace = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="M9 10v.500M15 10v.500" /><path d="M9 14.500c.900.900 1.900 1.300 3 1.300s2.100-.400 3-1.300" /></Svg>;
export const IconZoom = (p: P) => <Svg {...p}><circle cx="10.500" cy="10.500" r="6" /><path d="m15 15 5 5" /><path d="M8 10.500h5M10.500 8v5" /></Svg>;
export const IconTag = (p: P) => <Svg {...p}><path d="M4 12.200V5.500A1.500 1.500 0 0 1 5.500 4h6.700l8 8-8.200 8.200-8-8Z" /><circle cx="8.200" cy="8.200" r="1.200" /></Svg>;
export const IconRetry = (p: P) => <Svg {...p}><path d="M5 12a7 7 0 1 1 2.300 5.200" /><path d="M4.500 18.500v-4.200h4.200" /></Svg>;
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8.500" r="3.700" /><path d="M5 19.500c1.200-3.200 3.700-4.800 7-4.800s5.800 1.600 7 4.800" /></Svg>;
