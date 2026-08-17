import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getTrayIconSize,
  isLinuxTrayReliable,
  shouldCloseToTray,
  shouldCreateTray,
  shouldHideDockWhenHidingWindow,
  shouldQuitOnLastWindow
} from './trayPolicy';

describe('shouldCreateTray', () => {
  it('enables tray on Windows and macOS', () => {
    assert.equal(shouldCreateTray('win32'), true);
    assert.equal(shouldCreateTray('darwin'), true);
  });

  it('skips tray on GNOME and unknown Linux desktops', () => {
    assert.equal(shouldCreateTray('linux', 'ubuntu:GNOME'), false);
    assert.equal(shouldCreateTray('linux', 'GNOME'), false);
    assert.equal(shouldCreateTray('linux', ''), false);
  });

  it('enables tray on Linux desktops that usually show indicators', () => {
    assert.equal(shouldCreateTray('linux', 'KDE'), true);
    assert.equal(shouldCreateTray('linux', 'XFCE'), true);
    assert.equal(shouldCreateTray('linux', 'X-Cinnamon'), true);
  });
});

describe('isLinuxTrayReliable', () => {
  it('rejects empty and GNOME desktop values', () => {
    assert.equal(isLinuxTrayReliable(''), false);
    assert.equal(isLinuxTrayReliable('ubuntu:GNOME'), false);
  });
});

describe('getTrayIconSize', () => {
  it('uses a larger icon on macOS', () => {
    assert.equal(getTrayIconSize('darwin'), 22);
    assert.equal(getTrayIconSize('win32'), 16);
    assert.equal(getTrayIconSize('linux'), 16);
  });
});

describe('shouldCloseToTray', () => {
  it('hides to tray only when a tray exists and the app is not quitting', () => {
    assert.equal(shouldCloseToTray(false, true), true);
    assert.equal(shouldCloseToTray(true, true), false);
    assert.equal(shouldCloseToTray(false, false), false);
  });
});

describe('shouldQuitOnLastWindow', () => {
  it('keeps the app running on macOS even without a tray', () => {
    assert.equal(shouldQuitOnLastWindow(false, 'darwin'), false);
    assert.equal(shouldQuitOnLastWindow(true, 'darwin'), false);
  });

  it('quits on Windows and Linux when tray creation failed', () => {
    assert.equal(shouldQuitOnLastWindow(false, 'win32'), true);
    assert.equal(shouldQuitOnLastWindow(false, 'linux'), true);
    assert.equal(shouldQuitOnLastWindow(true, 'win32'), false);
    assert.equal(shouldQuitOnLastWindow(true, 'linux'), false);
  });
});

describe('shouldHideDockWhenHidingWindow', () => {
  it('hides the Dock only on macOS', () => {
    assert.equal(shouldHideDockWhenHidingWindow('darwin'), true);
    assert.equal(shouldHideDockWhenHidingWindow('win32'), false);
    assert.equal(shouldHideDockWhenHidingWindow('linux'), false);
  });
});
