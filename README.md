# cloki - Zero Dependency and Simple Logging Library from Cloudflare Workers to Grafana Cloud's Loki

[![NPM Version](https://img.shields.io/npm/v/%40miketako3%2Fcloki)](https://www.npmjs.com/package/@miketako3/cloki)
[![NPM License](https://img.shields.io/npm/l/%40miketako3%2Fcloki)](https://github.com/miketako3/cloki/blob/main/LICENSE)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/miketako3/cloki/release.yaml)](https://github.com/miketako3/cloki/actions/workflows/release.yaml)
[![GitHub Release Date - Published_At](https://img.shields.io/github/release-date/miketako3/cloki)](https://github.com/miketako3/cloki/releases)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/y/miketako3/cloki)](https://github.com/miketako3/cloki/commits/main)
[![GitHub contributors](https://img.shields.io/github/contributors/miketako3/cloki)](https://github.com/miketako3/cloki/graphs/contributors)
[![NPM Downloads](https://img.shields.io/npm/dt/%40miketako3%2Fcloki)](https://www.npmjs.com/package/@miketako3/cloki)

## Introduction

Welcome to **cloki**, an open-source logger designed to bridge [Cloudflare Workers](https://www.cloudflare.com/developer-platform/workers/) with [Grafana Cloud's Loki](https://grafana.com/products/cloud/logs/) seamlessly and efficiently. Targeted at individual developers, cloki aims to reduce maintenance costs while offering a straightforward logging solution. With minimal configuration and the sole use of the fetch API, cloki is an easy-to-implement tool for effective logging.

## Features

- **Easy Integration**: Connect Cloudflare Workers with Grafana Cloud's Loki effortlessly.
- **Minimal Configuration**: Get started with just a few simple settings.
- **Zero Dependencies**: cloki has zero dependencies, making it easy to maintain.
- **Fetch API Usage**: cloki uses the Fetch API, so it can be used in any environment like edge runtime.

## Installation

```shell
$ npm i @miketako3/cloki
```

## Grafana Cloud Setup

1. Create a Grafana Cloud account from [here](https://grafana.com/).
2. Access https://grafana.com/orgs/${YOUR_ORG_NAME}
3. Click Detail. ![](static/image1.png)
4. You got the required information. ![](static/image2.png)

## Usage

```typescript
import {Cloki} from '@miketako3/cloki'

const logger = getLokiLogger({
  lokiHost: "Host URL (e.g. logs-xxx-yyy.grafana.net)",
  lokiUser: "User (e.g. 123456)",
  lokiToken: "Generated API Token"
});

await logger.info({message: "Hello World!"});

await logger.error({message: "Hello World!", error: error});

// with addional labels
await logger.info({message: "Hello World!"}, {foo: "bar"});
```

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are greatly appreciated.

- Fork the Project
- Create your Feature Branch (git checkout -b feature/AmazingFeature)
- Commit your Changes (git commit -m 'Add some AmazingFeature')
- Push to the Branch (git push origin feature/AmazingFeature)
- Open a Pull Request

## License

Distributed under the MIT License. See **LICENSE** for more information.

## Contacts

miketako3 (Kaito Hiruta) - contact@miketako.xyz

Project Link: https://github.com/miketako3/cloki
