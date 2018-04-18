#!/usr/bin/env node

const program = require('commander')
const inquirer = require('inquirer')
const _ = require('lodash')
const fs = require('fs')
const { ApolloClient } = require('apollo-client')
const gql = require('graphql-tag')
const { HttpLink } = require('apollo-link-http');
const { ApolloLink } = require('apollo-link')
const { InMemoryCache } = require('apollo-cache-inmemory');
const fetch = require('node-fetch');
const { createUploadLink } = require('apollo-upload-client')
const FormData = require('form-data')
const { execSync } = require('child_process')

const functionName = _.last(process.cwd().split('/'))

const questions = [
  {
    type: 'input',
    name: 'name',
    message: 'Function name',
    default: functionName,
  },
  {
    type: 'input',
    name: 'version',
    message: 'Version',
    default: '1.0.0',
  },
  {
    type: 'input',
    name: 'main',
    message: 'Main function filename',
    default: 'index.js',
  },
  {
    type: 'input',
    name: 'trainData',
    message: 'Train data filename',
    default: `${functionName}-train-data.json`,
  },
];

const httpLink = new HttpLink({
  uri: 'http://localhost:4000',
  fetch,
});

const uploadLink = createUploadLink({
  uri: 'http://localhost:4000',
  serverFormData: FormData,
  fetch,
})

const cache = new InMemoryCache({
  dataIdFromObject: o => o.id
});

const client = new ApolloClient({
  link: uploadLink,
  cache,
});

const uploadCmd = (filename) => {
  return `curl -X POST 'http://localhost:4000/upload' -F "data=@${filename}; filename=${filename}"`;
};

const upload = (filename) => {
  return JSON.parse(execSync(uploadCmd(filename)).toString('utf8'));
};

const execPublish = async (config) => {
  console.log(`> Publishing function: ${config.name}`);
  console.log(JSON.stringify(config));

  const mainFile = upload(config.main);
  const trainDataFile = upload(config.trainData);

  const variables = {
    ...config,
    mainFileId: mainFile.id,
    trainDataFileId: trainDataFile.id,
  };

  const version = await client.mutate({
    mutation: gql`
      mutation publishVersion(
        $name: String!,
        $version: String!,
        $mainFileId: ID!,
        $trainDataFileId: ID!,
      ) {
        publishVersion(
          name: $name,
          version: $version,
          mainFileId: $mainFileId,
          trainDataFileId: $trainDataFileId,
        ) {
          id
        }
      }
    `,
    variables,
  });

  console.log(JSON.stringify(version));
};

const configFilename = `${process.cwd()}/future.json`;

program
  .command('init')
  .action((dir, cmd) => {
    console.log('> Initializing a Future function...');

    if (fs.existsSync(configFilename)) {
      console.log('- Config file future.json already exists.');
      return;
    }

    return inquirer.prompt(questions).then(answers => {
      fs.writeFileSync(configFilename, JSON.stringify(answers, null, 2), 'utf8');
      console.log('+ Config file future.json saved. To publish the function run `future publish`.');
    });
  })

program
  .command('publish')
  .action((dir, cmd) => {
    console.log('> Publishing a Future function...');

    if (!fs.existsSync(configFilename)) {
      console.log('- Config file future.json is missing. Run `future init` first.');
      return;
    }

    return execPublish(JSON.parse(fs.readFileSync(configFilename, 'utf8')));
  })

program.parse(process.argv)
