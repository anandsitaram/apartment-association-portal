# 🏢 Apartment Association Portal

A modern, mobile-friendly **apartment association management application** designed to simplify day-to-day activities for residents, administrators, and association management teams.

The application brings maintenance, payments, flats, expenses, visitors, parcels, service requests, facility bookings, polls, notifications, and reporting into one centralized platform.

---

## 🌟 Overview

The Apartment Association Portal replaces manual spreadsheets and disconnected processes with a single, easy-to-use application.

Residents can access their apartment-related information, payments, maintenance details, visitor updates, parcel notifications, tickets, bookings, and other association services.

Administrators can manage flats, users, monthly charges, expenses, payments, reports, facilities, visitors, parcels, and association activities according to their assigned permissions.

### 📱 The platform includes

- 🌐 Web application
- 📱 React Native mobile application
- 🔗 Shared backend API
- 🗄️ PostgreSQL database
- 🧩 Shared business and calculation logic

---

## ✨ Main Features

### 💰 Maintenance Management

- 📅 Monthly maintenance management
- 🏠 Flat-wise maintenance calculation
- ⚖️ Equal-share maintenance
- 💵 Common maintenance amount
- 📐 Per-square-foot maintenance
- 🔢 Configurable calculation and rounding rules
- 📊 Monthly maintenance records
- 💳 Payment tracking
- 📌 Outstanding balance tracking
- 🧾 Flat-wise maintenance details

---

### 🏦 Corp Fund

- 🏢 Corp Fund management
- ⚙️ Separate Corp Fund configuration
- 🏠 2 BHK and 3 BHK specific Corp Fund amounts
- 📐 Area/rate-based calculations where configured
- 📅 Monthly Corp Fund calculation
- ➕ Combined Maintenance + Corp Fund billing
- 📊 Separate Maintenance and Corp Fund visibility
- 💰 Expected total and balance tracking

---

### 🏠 Flat Management

- 🏢 Flat and resident information
- 🧱 Block-wise flat management
- 📐 Apartment type and area information
- 👤 Owner/user association
- 💳 Flat-level payment information
- 🔐 Flat-level access control
- 📥 Import support
- 📤 Export support

---

### 💸 Expense Management

- 📅 Monthly expense management
- 🗂️ Expense categories
- 💰 Expense amounts
- 📝 Expense details
- 🧱 Block-specific expense allocation
- 🏢 Common expense allocation
- 📊 Expense tracking for maintenance calculations

---

### 💳 Payment Management

- 📅 Monthly payment tracking
- 🏠 Flat-wise payment records
- ➕ Combined maintenance payment support
- 💰 Outstanding balance calculation
- 📜 Payment history
- ✅ Payment status tracking
- 📊 Payment summaries and reports

---

### 📊 Reports & Excel

The application provides reporting tools to help association administrators
track financial and apartment-related information.

- 📅 Monthly maintenance reports
- 🏠 Flat-wise reports
- 💳 Payment reports
- 💸 Expense reports
- ⚠️ Outstanding balance reports
- 📊 Summary reports
- 📗 Excel export
- 🧾 Association-format monthly reports

---

### 👥 User & Role Management

The application uses role-based access control to ensure users can access
only the features and information available to their account.

Supported roles include:

- 👤 **User**
- 🛠️ **Admin**
- 👑 **Super Admin**
- 🛡️ **Security**

Role permissions control access to screens, actions, apartment information,
and administrative functionality.

---

### 🚪 Visitor Management

- 👥 Visitor access management
- 🔑 Visitor access codes
- 📝 Visitor information
- ✅ Visitor approval workflows
- 🔐 Role-based visitor information access
- ⏰ Visitor access expiry handling
- 🔔 Visitor-related notifications

---

### 🛡️ Security Management

Security users can perform security-related activities through the mobile
application.

Features include:

- 🔑 Visitor access verification
- 📷 QR/access-code scanning
- 👤 Visitor-related actions
- 📸 Photo capture
- 📤 Sending photos to the respective flat owner
- ✅ Owner approval/rejection workflow
- ⏳ Pending approval status

---

### 📦 Parcel Management

- 📦 Parcel notifications
- 📝 Parcel information
- 📸 Parcel photo support
- 🔔 Parcel photo notifications
- 🔐 Owner-specific parcel information
- 🗑️ Parcel photo deletion where permitted
- 🛡️ Security-assisted parcel updates

---

### 🎫 Tickets & Service Requests

Residents can raise service requests and tickets for apartment-related issues.

Administrators can manage, track, and respond to requests according to their
assigned permissions.

---

### 🏟️ Facility & Party-Hall Booking

- 🏢 Facility availability
- 📅 Booking management
- 🎉 Party-hall bookings
- 📋 Booking information
- 🔐 Role-based booking management

---

### 🗳️ Polls & Voting

The application supports association-level polls and voting.

- 🗳️ Create polls
- 👥 Resident voting
- 📊 View poll results
- 📋 Support association decisions

---

### 🔔 Notifications

The application provides notifications for important apartment activities,
including:

- 💰 Maintenance updates
- 💳 Payment information
- 🚪 Visitor updates
- 📦 Parcel notifications
- 🎫 Service-related updates
- 📢 Other association activities

---

## 📱 Mobile Application

The React Native mobile application provides residents, administrators, and
security users with mobile access to the association system.

### Mobile features include

- 🏠 Dashboard
- 💰 Maintenance information
- 🏦 Corp Fund information
- 💳 Payment information
- 🏢 Flats
- 💸 Expenses
- 🚪 Visitors
- 📦 Parcels
- 🎫 Tickets
- 🏟️ Facility bookings
- 🗳️ Polls
- 🔔 Notifications
- 🛡️ Security features
- 👤 Account management

The mobile application uses the same backend API and shared business logic as
the web application.

---

## 🎨 User Experience

The application is designed to provide a consistent experience across web and
mobile.

The interface focuses on:

- 📱 Mobile-friendly layouts
- 🧭 Simple and clear navigation
- 🎯 Easy access to important actions
- 📊 Clear monthly information
- 💰 Easy-to-understand payment and balance information
- 🔐 Role-specific screens and permissions
- 🔔 In-app notifications and messages
- 📋 Responsive tables and reports
- 📐 Consistent alignment and spacing

---

## 🏗️ Architecture

The project contains web and mobile applications backed by a common API,
database, and shared business logic.

```text
🏢 Apartment Association Portal
│
├── 🌐 Web Application
│   └── React + Vite + TypeScript
│
├── 📱 Mobile Application
│   └── React Native
│
├── 🔗 Backend API
│   └── Node.js + TypeScript
│
├── 🧩 Shared Logic
│   └── Types, calculations, roles, API utilities
│
└── 🗄️ Database
    └── PostgreSQL
