# kaBRGY
## Be Heared, Be Transparent, Be Notified, Your Barangay Is Just One Click Away

This is the Developer Notes Tab that shows the progress of the build and how it grows,
as well as the remarks each developers had after their own update.

This will serve as a guide for other developers!

## Version: 1.0.1
(↑) Updated the new Primary Keys in the Supabase Database.

(↑) Updated the create-admin.js to accomodate the new Formating of our PK inside our Database

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
    (-)     =       Removed a File/Folder/Component

Enjoy!