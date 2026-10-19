import { b64ToBytes, parseBattery, parseHeartRate } from '../ble/parsers';
import { addHr } from '../storage';

test('decodes base64', () => {
  expect(b64ToBytes('AEg=')).toEqual([0, 72]);
});
test('8-bit heart rate', () => {
  expect(parseHeartRate([0, 72])).toBe(72);
});
test('16-bit heart rate', () => {
  expect(parseHeartRate(b64ToBytes('AZYA'))).toBe(150);
});
test('rejects invalid heart rate', () => {
  expect(parseHeartRate([0, 0])).toBeNull();
  expect(parseHeartRate([0, 255])).toBeNull();
  expect(parseHeartRate([1, 5])).toBeNull();
  expect(parseHeartRate([])).toBeNull();
});
test('battery', () => {
  expect(parseBattery([88])).toBe(88);
  expect(parseBattery([200])).toBeNull();
});
test('addHr prevents duplicates within the same second', () => {
  const a = addHr([], 70, 5000);
  expect(addHr(a, 71, 5400)).toHaveLength(1);
  expect(addHr(a, 71, 6100)).toHaveLength(2);
});
