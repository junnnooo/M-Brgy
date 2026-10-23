# kaBRGY
## Be Heared, Be Transparent, Be Notified, Your Barangay Is Just One Click Away

This is the Developer Notes Tab that shows the progress of the build and how it grows,
as well as the remarks each developers had after their own update.

This will serve as a guide for other developers!

## Version: 1.0.3-c
(↑ | ~) Updated and Fixed Bugs that is present in client files
(↑ | ~) Updated and Fixed Bugs that is present in routes files

(↑) Updated accounts.js, notification.js, reports.js, and request.js to fix current bugs related in the system
(↑) Updated tables in the database to rehook and be wired properly

(~ | +) Fixed and Added a new column in our database to house the Archive mechanic

(~) Fixed bug in the Admin panel where archive button is not working
(~) Fixed bug in the Admin panel where Update status has a broken end point
(~) Fixed bug in the Admin panel where the status is not updating
(~) Fixed bug in the Admin panel, fixed the similar problem that consern has when updating and setting a new status
(~) Fixed bug in the Residents panel, Notifications button for setting all notifications as read as been fixed
(~) Fixed bug in the Residents panel, Silent bug, notifications not being clicable and gets you redirected to the specific area for that notification
(~) Fixed bug in the Residents panel, Silent bug, fixed the small issue with the notifications dropdown design

(*) Bug in the Residents panel, Mobile Bug, Notification dropdown is overflowing from the screen

## Version: 1.0.3-b
(↑ | ~) Updated and Fixed Bugs that is present in client files
(↑) Updated app.js to house the new updates properly

(~) Fixed silent bug in client/style.css that causes archive button to not show in the Admin panel
(~) Fixed silent bug that doesn't let notifications is_read not updating and not letting notifications be labbled as read
(~) Fixed issue with notification bell not showing the notification dropdown
(~) Fixed issue where notification dropdown gets stuck as opened

(*) Bugged in the Admin panel, with the new update, the archive button has no endpoint in the Database
(*) Bugged in the Admin panel, with the new update, the Update status has a broken endpoint, This doesn't have a place to update, hook endpoint is broken
(*) Bugged in the Admin panel, with the new update, Status not updating
(*) Bugged in the Admin panel, with the new update, the consern reports has the similar problem as the Update status
(*) Bugged in the Residents panel, with the new update, Notification's button for mark read is broken, not setting all unread notifications as read

## Version: 1.0.3-a
(↑) Updated client Files to fit the new "old-prototype" files

(*) System has encountered Bugs from Notifications to reports, request and finally accounts of the user
(*) System is currently buggy in the client/app.js, Fixing this will be the priority for the next update
(*) System is currently leaking important information (like passwords)

## Version: 1.0.2
(↑) Updated Files to fit the new Stupabase Data

Files and Folders:

        client folder
            api.js
            app.js
            index.html
            style.css
        old-prototype folder
            app.js
            index.html
            README.md
            style.css
        server folder
            middleware
                auth.js
            node_modules folder
            routes folder
                accounts.js
                (↑) alerts.js
                (↑) announcements.js
                (↑) auth.js
                (↑) barangay.js
                (↑) locations.js
                notification.js
                reports.js
                request.js
                (↑) services.js
            scripts folder
                create-admin.js
            utils folder
                helpers.js
            index.js
            package-lock.json
            package.json
        .gitignore

## Version: 1.0.1
(↑) Updated the new Primary Keys in the Supabase Database.

(↑) Updated the create-admin.js to accomodate the new Formating of our PK inside our Database

(*) Bugs: Need to adjust all routing to the new formating in the database

Files and Folders:

        client folder
            api.js
            app.js
            index.html
            style.css
        old-prototype folder
            app.js
            index.html
            README.md
            style.css
        server folder
            middleware
                auth.js
            node_modules folder
            routes folder
                accounts.js
                alerts.js
                announcements.js
                auth.js
                barangay.js
                locations.js
                notification.js
                reports.js
                request.js
                services.js
            scripts folder
                (↑) create-admin.js
            utils folder
                helpers.js
            index.js
            package-lock.json
            package.json
        .gitignore


## Version: 1.0.0
First Working Prototype, Still Needs Improvement

Currently having a bug here when login in to admin with a non admin account shows the regular residents view then jumping back to login page because that specific account is a non admin account.


## Version: 0.2.2-b
Creation of Routes that is hooked to the Database, as well as a middleware (still buggy) 
    and helpers (both fir creating new admins and utility wise)

    Files and Folders:

        client folder
            api.js
            app.js
            index.html
            style.css
        old-prototype folder
            app.js
            index.html
            README.md
            style.css
        server folder
            (+) middleware
                (+) auth.js
            node_modules folder
            routes folder
                (+) accounts.js
                (+) alerts.js
                (+) announcements.js
                (+) auth.js
                (+) barangay.js
                (+) locations.js
                (+) notification.js
                (+) reports.js
                (+) request.js
                (+) services.js
            scripts folder
                (+) create-admin.js
            utils folder
                (+) helpers.js
            index.js
            package-lock.json
            package.json
        .gitignore

## Version: 0.2.2-a
Transformation of old-prototype into the newly adjusted system in our file tree.
Also, hooked up Supabase to our system (also added a .env file but I won't list it here)

    Files and Folders:

        client folder
            (+) api.js
            (+) app.js
            (+) index.html
            (+) style.css
        old-prototype folder
            app.js
            index.html
            README.md
            style.css
        server folder
            node_modules folder
            routes folder
            scripts folder
            utils folder
                (+) supabase.js
            (/+/) .env 
            index.js
            package-lock.json
            package.json
        .gitignore


## Version: 0.2.1
Addded Files inside folders

    Files and Folders:

        client folder
        old-prototype folder
            (~) app.js
            (~) index.html
            (~) README.md
            (~) style.css
        server folder
            node_modules folder
            routes folder
            scripts folder
            utils folder
            (+) index.js
            (~) package-lock.json
            (~) package.json
        (+) .gitignore

I've only moved files labeled with (~) to their respective folders
I've moved the old project schematic into an old-prototype folder so it still lives there and can be tested


### Version: 0.0.1
Basic File Tree has been formated, as well as the installation of Node.js, Express, and Supabase

    Folders:

    (+) client folder
    (+) old-prototype folder
    (+) server folder
        (+) node_modules folder
        (+) routes folder
        (+) scripts folder
        (+) utils folder

Creation of files (like .env, index.js, both package.json, ect)


## How to Run:

1. Open two terminals
2. On the first terminal, do:

        npx serve client -l 5173

    make sure you are in the same directory as the index.js

3. On the second terminal, do:

        npm run dev

    make sure you are in the "server" directory


## Symbols To Remember

    (+)     =       Added a new File/Folder/Component
    (~)     =       Moved a File/Folder/Component
    (↑)     =       Updated a File/Component
    (*)     =       Currently Bugged in the System
    (-)     =       Removed a File/Folder/Component

Enjoy!