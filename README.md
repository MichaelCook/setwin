# setwin

A Gnome shell extension to place and size windows with a single click

This extension adds a button to the status bar. When you click the button, the
extension sets the size and location of each window according to rules you
specify in a Json file.

## setwin.json

The extension looks for the Json file as ~/.config/setwin.json.

The file is an array of Json objects like the following:

    {
        "wmclass": "^Emacs$",
        "title": "@porcupine|@ursine",
        "workspace": 0,
        "x": 0,
        "y": 0,
        "width": 920,
        "height": -60
    },

`wmclass` and `title` are regular expressions (Perl style). These fields are
optional. Typically you'd specify one, or the other, or both.

If `wmclass` matches the window's class and if `title` matches the window's
title, then this rule is applied.

`workspace` tells setwin to move the window to the specified
workspace. The value is a 0-based index of the workspace, or -1 to make the
window "sticky" (on all workspaces).

`x` and `y` set the window's position. If `x` is negative then it is calculated
relative to the right side of the monitor. A negative `y` is relative to the
bottom of the monitor.

`width` and `height` set the window's size. A negative width is relative to the
monitor width. A negative height is relative to the monitor height. A `0` value
means to maximize the width/height of the window.

If any of the fields `workspace`, `x`, `y`, `width` or `height` are missing,
then the window is left unchanged regarding that setting.  For example, if
`workspace` is missing, then the window is left on whatever workspace it was
originally on.

See the setwin.json file in this repository for an example.

## Changing setwin.json

Each time you click the button, the extension re-reads setwin.json. You can
experiment with rules by editing setwin.json using your favorite text editor and
then click the button to see the effects immediately.

## Installing & enabling the extension

Install the extension:

    gnome-extensions pack setwin@waxrat.com
    gnome-extensions install --force setwin@waxrat.com.shell-extension.zip

Logout and log back in.

Enable the extension:

    gnome-extensions enable setwin@waxrat.com

## Troubleshooting

If you make mistakes in the setwin.json file, the extension will log errors.
Look for errors like this:

    grep gnome-shell /var/log/syslog

or

    tail --follow=name /var/log/syslog | grep gnome-shell

or

    journalctl -f -o cat /usr/bin/gnome-shell

To check the Json syntax:

    jq . ~/.config/setwin.json
