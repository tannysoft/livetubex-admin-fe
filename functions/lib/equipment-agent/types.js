"use strict";
/**
 * Type ของแผนจัดอุปกรณ์ — ฝาแฝดของ lib/types.ts ฝั่งเว็บ (functions เป็นคนละ package import ข้ามกันไม่ได้)
 * ⚠️ แก้ Equipment / PlanItem / PlanDiagram / DEFAULT_PORTS ฝั่งเว็บแล้วต้องแก้ที่นี่ด้วย
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PORTS = exports.SIGNALS = exports.LAYOUT_KINDS = exports.LAYOUT_ZONES = exports.CATEGORY_LABEL = exports.CATEGORIES = void 0;
exports.newId = newId;
exports.CATEGORIES = [
    'camera', 'lens', 'switcher', 'audio', 'monitor', 'converter', 'wireless', 'recorder',
    'intercom', 'network', 'cable', 'power', 'support', 'lighting', 'other',
];
exports.CATEGORY_LABEL = {
    camera: 'กล้อง', lens: 'เลนส์', switcher: 'สวิตเชอร์', audio: 'เสียง', monitor: 'มอนิเตอร์',
    converter: 'Converter/Router', wireless: 'Wireless Video (ส่งภาพไร้สาย)', recorder: 'Recorder/Encoder', intercom: 'Intercom/Tally',
    network: 'Network', cable: 'สาย', power: 'ไฟฟ้า/UPS', support: 'ขาตั้ง/Grip/Gimbal', lighting: 'ไฟส่องสว่าง', other: 'อื่นๆ',
};
/** โซนในผังวาง 3D — ⚠️ ฝาแฝดของ LayoutZone ใน lib/equipment/layout-zones.ts (ฝั่งเว็บแปลงเป็นพิกัด) */
exports.LAYOUT_ZONES = [
    'stage_front_left', 'stage_front_center', 'stage_front_right', 'on_stage',
    'floor_left', 'floor_right', 'foh_center', 'back_left', 'back_right', 'ob_area',
];
exports.LAYOUT_KINDS = ['camera', 'jib', 'ob_truck', 'desk', 'screen', 'speaker', 'riser', 'podium', 'gimbal', 'remote_head', 'micro_stand', 'action_cam', 'ptz', 'tele_lens', 'box_lens', 'generic'];
exports.SIGNALS = ['sdi', 'hdmi', 'fiber', 'audio', 'network', 'intercom', 'control', 'power', 'other'];
exports.DEFAULT_PORTS = {
    camera: { inputs: [], outputs: ['SDI OUT'] },
    lens: { inputs: [], outputs: [] },
    switcher: { inputs: ['IN 1', 'IN 2', 'IN 3', 'IN 4'], outputs: ['PGM', 'AUX', 'MV'] },
    audio: { inputs: ['IN 1', 'IN 2'], outputs: ['MAIN L/R'] },
    monitor: { inputs: ['IN'], outputs: [] },
    converter: { inputs: ['IN'], outputs: ['OUT'] },
    wireless: { inputs: ['SDI IN (TX)', 'HDMI IN (TX)'], outputs: ['SDI OUT (RX)', 'HDMI OUT (RX)'] },
    recorder: { inputs: ['IN'], outputs: ['LOOP'] },
    intercom: { inputs: [], outputs: [], ios: ['CH A'] },
    network: { inputs: [], outputs: [], ios: ['UPLINK', 'PORT 1', 'PORT 2', 'PORT 3', 'PORT 4'] },
    cable: { inputs: [], outputs: [] },
    power: { inputs: ['AC IN'], outputs: ['OUT 1', 'OUT 2'] },
    support: { inputs: [], outputs: [] },
    lighting: { inputs: ['AC IN'], outputs: [] },
    other: { inputs: ['IN'], outputs: ['OUT'] },
};
/** เหมือน newId() ฝั่งเว็บ */
function newId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
//# sourceMappingURL=types.js.map