# SSM Helper Plugin for Serverless

[![npm (scoped)](https://img.shields.io/npm/v/@otani.sg/serverless-ssm-helper)](https://www.npmjs.com/package/@otani.sg/serverless-ssm-helper) ![NPM](https://img.shields.io/npm/l/@otani.sg/serverless-ssm-helper)

Serverless plugin for making working with SSM parameters in serverless project easier.

+ Allow deployer to interactively entering parameter values if the parameters don't exist.
+ Load parameters from SSM in less API calls by using `getParametersByPath` instead of calling `getParameter` for each parameter.

## Install

```bash
$ sls plugin install -n @otani.sg/serverless-ssm-helper
```

## Caveats

Currently this plugin always creates new parameters using SecureString.