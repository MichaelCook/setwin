// Copyright (c) Michael Cook <michael@waxrat.com> All rights reserved.

'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib'
import St from 'gi://St';
import Shell from 'gi://Shell'
import Meta from 'gi://Meta'

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

class Rule {
    constructor(wmclass, title, workspace, x, y, width, height, above, max_match) {
        this.wmclass = wmclass === undefined ? undefined : new RegExp(wmclass);
        this.title = title === undefined ? undefined : new RegExp(title);
        this.workspace = workspace; // 0-based, -1 means sticky (i.e., all workspaces)
        this.x = x;
        this.y = y;
        this.width = width;     // 0 to maximize
        this.height = height;   // 0 to maximize
        this.above = above;     // "Always on top"
        this.max_match = max_match;
    }
}

Rule.prototype.toString = function() {
  return `Rule(${this.wmclass},${this.title},${this.workspace},` +
         `${this.x},${this.y},${this.width},${this.height},` +
         `${this.above},${this.max_match})`;
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Setwin 45 Indicator'));

        this.add_child(new St.Icon({
            icon_name: 'view-grid-symbolic',
            style_class: 'system-status-icon',
        }));

        let item = new PopupMenu.PopupMenuItem(_('Place windows'));
        item.connect('activate', this._activated);
        this.menu.addMenuItem(item);
    }

    _activated() {
        log('setwin45: _activated...');

        let home_dir = GLib.get_home_dir();
        let config_path = GLib.build_filenamev([home_dir, '.config/setwin.json']);

        let contents = Shell.get_file_contents_utf8_sync(config_path);

        let configs = JSON.parse(contents);

        /*
          Create the array of Rules objects from the `config_path` file
         */
        let rules = [];
        configs.forEach(function (cfg) {
            let wmclass = cfg['wmclass'];
            let title = cfg['title'];
            let workspace = cfg['workspace'];
            let x = cfg['x'];
            let y = cfg['y'];
            let width = cfg['width'];
            let height = cfg['height'];
            let above = cfg['above'];
            let max_match = cfg['max_match'];
            let rule = new Rule(wmclass, title, workspace, x, y, width, height, above, max_match);
            // log(`setwin45: rule ${rule}`);
            rules.push(rule);
        });

        log(`setwin45: Rule count ${rules.length}`);

        /*
          Get the monitor size
        */
        let geo = global.display.get_monitor_geometry(0);  // TODO: support multiple monitors
        log(`setwin45: monitor geometry ${geo.x} ${geo.y} ${geo.width} ${geo.height}`);
        let monitor_width = geo.width;
        let monitor_height = geo.height;

        /*
          For each window, try to match each rule.
          If there's a match, then apply the rule's settings to that window
         */
        let actors = global.get_window_actors();
        log(`setwin45: actors=${actors}`);
        actors.forEach(function (actor) {
            let mw = actor.meta_window
            let wmclass = mw.get_wm_class();
            let title = mw.get_title();
            log(`setwin45: Window "${wmclass}" "${title}"`);

            rules.forEach(function (rule) {
                log(`setwin45: Matching ${rule}`);

                if (rule.max_match !== undefined && rule.max_match == 0) {
                    log(`setwin45: | exhausted max_match`);
                    return;
                }

                if (rule.wmclass !== undefined) {
                    let wmclass = mw.get_wm_class();
                    if (!rule.wmclass.test(wmclass)) {
                        log(`setwin45: | wmclass unmatched ${wmclass}`);
                        return;
                    }
                    log(`setwin45: | wmclass matched ${wmclass}`);
                }

                if (rule.title !== undefined) {
                    let title = mw.get_title();
                    if (!rule.title.test(title)) {
                        log(`setwin45: | title unmatched ${title}`);
                        return;
                    }
                    log(`setwin45: | title matched ${title}`);
                }

                log(`setwin45: | | APPLY`);

                if (rule.max_match !== undefined)
                    --rule.max_match;

                let x = rule.x;
                let y = rule.y;
                let width = rule.width;
                let height = rule.height;

                if (width === 0 && height === 0) {
                    log(`setwin45: | | | maximize both`);
                    mw.maximize(Meta.MaximizeFlags.BOTH);
                    x = y = width = height = undefined;
                } else if (width === 0) {
                    log(`setwin45: | | | maximize horizontal`);
                    mw.maximize(Meta.MaximizeFlags.HORIZONTAL);
                    x = width = undefined;
                } else if (height === 0) {
                    log(`setwin45: | | | maximize vertical`);
                    mw.maximize(Meta.MaximizeFlags.VERTICAL);
                    y = height = undefined;
                }

                if (x !== undefined || y !== undefined || width !== undefined || height != undefined) {
                    let old_x = actor.get_x();
                    let old_y = actor.get_y();
                    let old_width = actor.get_width();
                    let old_height = actor.get_height();
                    if (x === undefined)
                        x = old_x;
                    else if (x < 0)
                        x = monitor_width + x;
                    if (y === undefined)
                        y = old_y;
                    else if (y < 0)
                        y = monitor_height + y;
                    if (width === undefined)
                        width = old_width;
                    else if (width < 0)
                        width = monitor_width + width;
                    if (height === undefined)
                        height = old_height;
                    else if (height < 0)
                        height = monitor_height + height;
                    log(`setwin45: | | | x ${old_x}->${x}, y ${old_y}->${y}, w ${old_width}->${width}, h ${old_height}->${height}`);
                    mw.move_resize_frame(true, x, y, width, height);
                }

                if (rule.workspace !== undefined) {
                    if (rule.workspace == -1) {
                        mw.stick();
                    } else {
                        mw.unstick();
                        log(`setwin45: | | | workspace ${rule.workspace}`);

                        /* Create new workspaces if necessary */
                        let mgr = global.workspace_manager;
                        for (let i = mgr.n_workspaces; i <= rule.workspace; i++) {
                            log(`setwin45: | | | add workspace ${i-1}`);
                            mw.change_workspace_by_index(i - 1, false);
                            mgr.append_new_workspace(false, 0);
                        }

                        mw.change_workspace_by_index(rule.workspace, false);
                    }
                }

                if (rule.above !== undefined) {
                    if (rule.above) {
                        log(`setwin45: | | | make_above`);
                        mw.make_above();
                    } else {
                        log(`setwin45: | | | unmake_above`);
                        mw.unmake_above();
                    }
                }
            });
        });

        log('setwin45: _activated...done');
    }
});

export default class SetwinExtension extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        log('setwin45: enable')
    }

    disable() {
        log('setwin45: disable')
        this._indicator.destroy();
        this._indicator = null;
    }
}
