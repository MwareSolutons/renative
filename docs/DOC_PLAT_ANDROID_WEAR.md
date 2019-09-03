---
id: androidwear
title: Android Wear Platform
sidebar_label: Android Wear
---


<img src="https://github.com/pavjacko/renative/blob/develop/docs/images/ic_androidwear.png?raw=true" width=50 height=50 />

## Android Wear

![](https://img.shields.io/badge/Mac-yes-brightgreen.svg)
![](https://img.shields.io/badge/Windows-yes-brightgreen.svg)
![](https://img.shields.io/badge/Linux-yes-brightgreen.svg)
![](https://img.shields.io/badge/HostMode-n/a-lightgrey.svg)

<table>
  <tr>
    <th>
      <img src="https://github.com/pavjacko/renative/blob/develop/docs/images/rnv_androidwear.gif?raw=true" />
    </th>
  </tr>
</table>

-   Latest Android project
-   Kotlin Support
-   Support for Gradle 4.9

#### Requirements

-   [Android Studio](https://developer.android.com/studio/index.html) for Android development
-   [Android SDK](https://developer.android.com/sdk/) `23.0.1` or newer for Android development

#### Project Configuration

| Feature        | Version  |
| -------------- | :------: |
| Gradle         | `4.10.1` |
| Android Gradle | `3.3.1`  |
| Kotlin         | `1.3.20` |
| Target SDK     |   `27`   |

#### Run

NOTE: make sure you have 1 android wear device connected or 1 wear emulator running

```
rnv run -p androidwear
```

NOTE: There is a bug in RN. for now you must NOT have running bundler (`$ rnv start`) in order for wear sim to work

#### Advanced

Clean and Re-build platform project

```
rnv run -p androidwear -r
```

Launch specific emulator:

```
rnv target launch -p androidwear -t Android_Wear_Round_API_28
```

#### App Config

<a href="#android-based-config">see: Android based config</a>