module.exports = class ServerlessSSMHelperPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.provider = serverless.getProvider("aws");
    this.options = options;

    // Store loaded parameters
    this.parameters = {};

    // Replace provider request with our own
    this.providerRequest = this.provider.request.bind(this.provider);
    this.provider.request = this.request.bind(this);

    // A mutex to coordinate between async calls to SSM
    this.mutex = Promise.resolve();
  }

  async request(...args) {
    let [service, method, params] = args;

    if (service === "SSM" && method === "getParameter") {
      // Try to get the path
      const { Name: name } = params;
      return this.getValueFromSsmSynced(name);
    }

    return this.providerRequest(...args);
  }

  getValueFromSsmSynced(variableString) {
    // Only allowing call to getValueFromSsm once at a time
    // Otherwise command line will get messed up
    this.mutex = this.mutex
      .catch(() => {})
      // Add 1 tick between last call to getValueFromSsm and next call
      // To allow error message to be displayed between two calls
      .then(() => new Promise((resolve) => setTimeout(resolve)))
      .then(() => this.getValueFromSsm(variableString));
    return this.mutex;
  }

  async getValueFromSsm(variableString) {
    // Get the parent path of current variable
    const [path, _subpath] = variableString.split(/\/(?=[^\/]+$)/);

    // Load all parameters from the current path
    await this.loadParameters(path || "/");
    let parameter;

    if (variableString in this.parameters) {
      parameter = this.parameters[variableString];
      if (parameter instanceof Error) {
        throw this.parameters[variableString];
      }
    } else {
      parameter = await this.createParameter(variableString);
    }

    return {
      Parameter: parameter,
    };
  }

  async loadParameters(path) {
    // Short-circuit if this path was already loaded
    if (this.parameters[path]) return;

    let nextToken = undefined;
    while (true) {
      let response = await this.provider.request(
        "SSM",
        "getParametersByPath",
        {
          Path: path,
          MaxResults: 10,
          WithDecryption: true,
          NextToken: nextToken,
        },
        { useCache: true }
      );
      for (const param of response.Parameters) {
        // Avoid legacy warning
        if (param.Type === "SecureString") param.Type = "String";

        let paramName = param["Name"];

        // In case parameter name doesn't have slash, add implicit slash
        // to the name, so getValueFromSsm can find the parameter
        if (!paramName.startsWith("/")) {
          paramName = "/" + paramName;
        }

        this.parameters[paramName] = param;
      }
      if (response.NextToken) {
        nextToken = response.NextToken;
      } else {
        break;
      }
    }

    // Mark this path as loaded
    this.parameters[path] = true;
  }

  async createParameter(fullPath) {
    // TODO Get default value from template

    const value = await new Promise((resolve) => {
      // Quit early if the shell is not an input interface
      if (!process.stdin.isTTY) return resolve();

      const readline = require("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      // Disable variable tracker since we are interactively entering value
      this.serverless.variables.tracker?.stop();

      // TODO: Show default value if available from template
      rl.question(`Enter value for ${fullPath}: `, (answer) => {
        rl.close();
        resolve(answer);
      });
    });

    if (!value) {
      this.parameters[fullPath] = Error(
        `SSM Parameter ${fullPath} must have value before deployment`
      );
      throw this.parameters[fullPath];
    }

    // TODO Support different type
    const parameterType = "SecureString";

    await this.provider.request("SSM", "putParameter", {
      Name: fullPath,
      Value: value,
      Type: parameterType,
      Overwrite: true,
    });

    // Return type String instead of SecureString to avoid legacy warning
    const parameter = { Name: fullPath, Value: value, Type: "String" };
    this.parameters[fullPath] = parameter;

    return parameter;
  }
};
