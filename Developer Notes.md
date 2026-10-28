# kaBRGY
## Be Heared, Be Transparent, Be Notified, Your Barangay Is Just One Click Away

This is the Developer Notes Tab that shows the progress of the build and how it grows,
as well as the remarks each developers had after their own update.

This will serve as a guide for other developers!

## Version: 2.2.1 (OPTIMIZATION UPDATE PART 2 + MINOR UPDATE)

    (+) Added a Loading screen to make sure that the website is fully loaded
    (+) Added Page Automatically Updating
    (+) Added two new Notif sounds, Both regular and emergency notifs

    (~) Fixed Minor bug where in the /app, the icon for the website is not loaded/showing
    (~) Adjusted waiting time for the Page to update, From 1min -> 10sec
    (~) Fixed the Stupid Check box not aligned in Request Form
    (~) Changes on Request Form and Report a Consern in Residents Side, The changing of locations has a warning now

## Version: 2.2.0 (OPTIMIZATION UPDATE PART 1 + MINOR UPDATE)

    (+) Added/Applied proper AJAX formating to make the server feel more responsive and fast
    (+) Added new Indexes in the Database to help fetching
    (+) Added a Contact Us in the Landing Page

    (~) Modified/Revamped locations.js and fix some functions to house cache system
    (~) Adjusted auth.js in middleware and accounts.js to handel a more better way to verify users


## Version: 2.1.1

    (~) Fixed Bug in Combo boxes, Database, Routes, Not Properly Hooked Up
    (~) Fixed Bug in Nav Bar, "Home" and "Baranagy" Option Is Not Responsive, Does Not Update
    (~) Fixed Bug in The Hero Boxes In The Bottom Where It Redirects You to the User Guide On A Logged In Account As A "Resident"
    (~) Fixed Bug in the Footer Where The Logo Is Not Dynamically Sizing

## Version: 2.1.0 (SEMI-MINOR UPDATE)

    (+) Added a Landing Page [still incomplete]

    (*) Bug in Combo boxes, Database, Routes, Not Properly Hooked Up
    (*) Bug in Nav Bar, "Home" and "Baranagy" Option Is Not Responsive, Does Not Update
    (*) Bug in The Hero Boxes In The Bottom Where It Redirects You to the User Guide On A Logged In Account As A "Resident"
    (*) Bug in the Footer Where The Logo Is Not Dynamically Sizing

## Version: 2.0.2

    (*) Small UI Bug, Appointent documents, The service_name and checkbox is not alight with one another, Must fix
    (*) Small Routing Bug, When logged out as a resident, it doesn't set you back to the Landing page
    (*) Small Account Bug, When logged out as an account, it relogins you to a "Resident" [The dummy account]

## Version: 2.0.1
With the recent major update, there has also come some small updates

    (+) Added a new dropdown for the profile
    (+) Added the Logo of kaBRGY

    (~) Small Bug Fixes reguarding codes inside client folder
    (~ | -) Removed Track Status and Moved inside the new dropdown for profile 
    (~) Fixed Admin Panel where the numbers are the clickable ones in the dashboard not the div box that houses them
    (~) Small Quality of Life Changes

## Version: 2.0.0 (MAJOR UPDATE)

Residents Panel:

    (+) Added a Max Attempt/Limitation for using Service 3 attempt only.
    	> If the Status is Pending, Receive,  Approve, In progress, Ready to Pickup, it will count as 1 attempt.
    	> If the Status is Completed, Resolve, Rejected it will count as 0 attempt.
    (+) Added a Warning Display for attempting to break a rules.
        	> Warning Attempt is 0 of 3
          		- If the warning reaches 3 of 3 the account will get Deactivated. 
    (+) Added a Warning History 
    (+) Added a Deactivated Account Display, Resident Account temporary can't use the services 
    (+) Added a Reason for Deactivation 
    (+) Added a Appeal Form 
    (+) Added a Denied Appeal Reason Display 
    (+) Added a Notification for Account Status(Account Deactivated or Reactivated)

Admin Panel:

    (+) Added Recent resident verification requests redirect 
    (+) Added Recent annoucement redirect 
    (+) Added Collapsing Side Menu "Close Side Panel"
    (+) Added a Warning Feature on Resident account 
    (+) Added a Reason for Warning and Deactivation 
    (+) Added a Deactivate Account and Reactivate Feature 
    (+) Added a Accept Appeal and Deny Appeal Feature

    (~) "Admin Acoount" > "Staff Account"

    (-) Remove Quick Action Form

## Version: 1.1.2
    (+ | ~) Added and Updated Small Features for Quality of Life Changes

    (~) Fixed bug on Reject Option due to the changes in the Current Database

## Version: 1.1.1 (MAJOR UPDATE)
    (+) Added a new table in the Database [ref_counters] to house the reference numbers of each different type of request and concerns
    (+) Added a new option in request called "Rejected"
    (+) Added a way to see why the document is Rejected
    (+) Added a Close option in the Emergency Announcements in Residents View
    (+) Added a Category Section in the Track Status
    (+) Added a new Select button in the admin document request and concern reports. Can multi select multiple request and concerns
    (+) Added a way to Delete announcements, as well as a safety net "confirm delete"
    (+) Added an Archive feature in Announcements
    (+) Added a category inside residents verification where it separates Pending and Verified uses, for better organization
    (+) Added a feature in Admin where when rejecting a concern, Admin needs to provide a reason, also has a default input if admin has no reason to input
    (+) Added a feature in Admin where a request or a concern is labeled as Completed, Resolved, or Rejected, the request or concern will automatically be archived.

    (↑) Updated The Database to house the new added features as well as to handel the new Refferences

    (~) Reformated the Formatting of client/index.htm
    (~) Fixed Positioning on the Footer in the Announcement "Schedule" Section.
    (~) New Limit to how much documents you can request in one Request form. From 1 to 3 documents
    (~) Fix a Silent Bug, Where Archived request or concerns status can still be changed

    (*) Bug on Reject Option due to the changes in the Current Database
            Discovered: The Error is comming from the wrong packaging and wrong hook in the routes/reports.js

## Version: 1.0.4
    (↑) Updated client folder to fix the new old-prototype files

    (~) Fixed Bug in Residents Panel, Mobile Bug, Notification dropdown overflowing is now fixed
    (~) Fixed Bug in Residents Panel, Notifications in the incident/consern report is now coming though

## Version: 1.0.3-d
    (+ | ↑) Added and Updated new "old-prototype" for preparation for the emergency update

    (* | ~) Prividous Bug in the Residents Panel, Mobile Bug, is still not resolved
    (*) New Bug, Reseidents View, Notifications in the incident/consern report is not comming though
            Discovered: The notification being updated is the "Verified account"

Mini-Update to incorporate the new elements in preparation for the migration of new Client designs

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

    (+) Added a Search bar in Admin accounts to easily find gmail accounts of residents
    (+) Added a Archived Button and Archive section for both Requests and Conserns

    (~) A sight changes to wordings, Changed "Track a Report" to "Track Status"

    (-) Removed the "Location Tracker" inside Track Status

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
    (~)     =       Moved or Fixed a File/Folder/Component
    (↑)     =       Updated a File/Component
    (*)     =       Currently Bugged in the System
    (-)     =       Removed a File/Folder/Component

Enjoy!