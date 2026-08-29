# Project Brief — Lost & Found Management System

## 1. Project Title

**Lost & Found Management System**

**Product Name:** FindBack

---

## 2. Project Overview

FindBack is a web-based Lost & Found Management System that helps people report, search for, and recover lost or found items.

Users can report items they have lost or found, provide relevant details such as category, location, date, and description, and search existing reports for potential matches. When a user believes a found item belongs to them, they can submit a claim that can be reviewed before the item is returned.

The system also provides administrative capabilities for managing users, reports, claims, and inappropriate or suspicious content.

---

## 3. Problem Statement

Lost and found processes in schools, offices, public spaces, and organizations are often handled manually through announcements, social media posts, notice boards, or informal communication.

This makes it difficult to:

* Report lost or found items in a structured way
* Search through existing reports
* Identify potential matches
* Verify ownership
* Track the status of an item
* Maintain a reliable history of lost and found records

There is a need for a centralized platform that makes the lost-and-found process easier, more organized, and more transparent.

---

## 4. Product Vision

**Make it easier for people to find what they lost and return what they found.**

FindBack aims to provide a simple and trustworthy platform where lost and found information can be centralized, searched, claimed, and managed.

---

## 5. Target Users

### 5.1 General User

A person who has lost an item or found an item.

They should be able to:

* Create an account
* Report lost items
* Report found items
* Search available reports
* View item details
* Submit claims
* Track their reports and claims

### 5.2 Administrator

A person responsible for maintaining the platform.

Administrators should be able to:

* Manage users
* Review reports
* Manage claims
* Remove inappropriate or suspicious reports
* Monitor item statuses
* Maintain the overall integrity of the platform

---

## 6. Core User Journey

The primary user journey is:

**Register/Login → Report Lost or Found Item → Search Listings → Identify Potential Match → Submit Claim → Claim Review → Item Returned → Report Closed**

---

# 7. MVP Scope

The MVP focuses on the complete essential lost-and-found workflow.

## 7.1 User Management

* User registration
* User login/logout
* User profile
* View personal reports
* View personal claims

## 7.2 Lost Item Reporting

Authenticated users can report an item they have lost.

A lost-item report may contain:

* Item name
* Category
* Description
* Lost date
* Lost location
* Additional identifying information
* Optional image

Users can:

* Create their own lost-item reports
* View their reports
* Edit their reports
* Delete their reports

## 7.3 Found Item Reporting

Authenticated users can report an item they have found.

A found-item report may contain:

* Item name
* Category
* Description
* Found date
* Found location
* Additional information
* Optional image

Users can:

* Create their own found-item reports
* View their reports
* Edit their reports
* Delete their reports

## 7.4 Item Listings

Users can view available lost and found reports.

Each listing should provide relevant information such as:

* Item name
* Category
* Description
* Location
* Date
* Lost/Found type
* Current status
* Image, if available

Sensitive information should not be publicly displayed.

## 7.5 Search and Filtering

Users should be able to search for relevant lost or found items.

Search and filtering should support:

* Keyword
* Item category
* Location
* Date
* Lost/Found type
* Status

## 7.6 Item Details

Users can view detailed information about an individual lost or found report.

The system should clearly display:

* Item information
* Lost/found information
* Report status
* Relevant images
* Available actions

## 7.7 Claim Management

A user can submit a claim when they believe a found item belongs to them.

A claim may include:

* Reason for claiming the item
* Ownership-related information
* Additional information requested by the system

Claims should have statuses such as:

* Pending
* Approved
* Rejected

Authorized users should be able to review claims and approve or reject them.

## 7.8 Item Status Management

The system should track the lifecycle of an item.

Suggested statuses:

* **Open**
* **Claim Requested**
* **Claim Approved**
* **Returned**
* **Closed**

The status should change based on the actions performed during the lost-and-found process.

## 7.9 Administration

Administrators can:

* View users
* Manage users
* View lost and found reports
* Review reports
* Remove inappropriate reports
* View and manage claims
* Monitor item statuses

---

# 8. Business Rules

The following are the initial business rules for the MVP:

1. A user must be authenticated before creating a lost or found report.
2. A user can create and manage their own reports.
3. A user cannot modify another user's report.
4. A found item can receive one or more claims.
5. A claim must be reviewed before an item is marked as returned.
6. Only authorized users can approve or reject claims.
7. An approved claim should allow the item to proceed toward the returned state.
8. An item marked as returned should no longer be treated as an actively available item.
9. Administrators can manage users, reports, and claims when necessary.
10. Sensitive personal information should not be publicly exposed.
11. The system should maintain a clear status throughout the item's lifecycle.
12. Deleted or removed reports should no longer appear in active listings.

These rules are initial assumptions and may be refined as detailed requirements are defined.

---

# 9. Success Criteria

The MVP should allow a user to successfully:

1. Create an account.
2. Log in to the system.
3. Report a lost item.
4. Report a found item.
5. View available lost and found items.
6. Search and filter items.
7. View item details.
8. Submit a claim for a found item.
9. Review a submitted claim.
10. Approve or reject a claim when authorized.
11. Mark an item as returned.
12. Track the status of their reports and claims.

The system should provide a simple, understandable, and trustworthy experience for both people reporting items and people attempting to recover them.

---

# 10. Product Identity

## 10.1 Product Name

**FindBack**

### Meaning

FindBack represents the core purpose of the product:

> **Find what you lost. Give back what you found.**

The name is short, easy to remember, and directly connected to the product's purpose.

---

# 11. Brand Personality

FindBack should feel:

* Trustworthy
* Helpful
* Friendly
* Simple
* Safe
* Community-oriented

The product should avoid an overly complicated or corporate feel.

---

# 12. Logo Direction

## Recommended Concept

A simple combination of:

**Location Pin + Return/Recovery Arrow + Item**

The visual should communicate the journey:

**Lost → Found → Back to Owner**

The logo should be:

* Simple
* Recognizable
* Usable at small sizes
* Suitable for both light and dark backgrounds
* Usable as a standalone icon
* Usable with the FindBack wordmark

### Wordmark

**FindBack**

### Tagline

**Find it. Return it.**

The logo design will be finalized as part of the product's visual design.

---

# 13. Color Direction

The initial brand palette is:

| Purpose   | Color  | Hex       |
| --------- | ------ | --------- |
| Primary   | Indigo | `#4F46E5` |
| Secondary | Teal   | `#14B8A6` |
| Success   | Green  | `#22C55E` |
| Warning   | Amber  | `#F59E0B` |
| Error     | Red    | `#EF4444` |

Neutral colors should be used for:

* Backgrounds
* Text
* Borders
* Cards
* Disabled states

The final palette, contrast, typography, spacing, and design tokens will be established during the UX/design phase.

---

# 14. Design Principles

### Simple

Users should immediately understand how to report and search for items.

### Trustworthy

The interface should make users feel that their information and claims are handled responsibly.

### Clear

Important information such as item status and claim status should be easy to understand.

### Accessible

The interface should use readable typography, sufficient contrast, clear labels, and understandable interactions.

### Action-Oriented

Primary actions such as **Report Lost Item**, **Report Found Item**, **Search Items**, and **Submit Claim** should be easy to discover.

---

# 15. Requirements Direction

This Project Brief provides the foundation for defining the detailed product requirements.

The detailed requirements should further clarify:

* Functional requirements
* Non-functional requirements
* User roles and permissions
* User stories and acceptance criteria
* Detailed business rules
* Item and claim lifecycle
* Search and filtering behavior
* Validation requirements
* Error and edge-case handling
* Data requirements
* Security and privacy requirements
* MVP boundaries
* UX requirements
* Success criteria

The detailed requirements should remain focused on the MVP scope defined in this brief. Any functionality outside the defined MVP should not be included unless the project scope is formally changed.

---

# 16. Scope Boundary

**The project will implement only the features defined within this MVP scope.**

Any functionality not defined in this Project Brief or subsequently approved during the detailed requirements process should be considered **out of scope for this project**.
