const inquirer = require('inquirer');
const optionator = require('optionator');
// const credentials = require('.credentials');
const fs = require('fs-extra');

const CFonts = require('cfonts');
const chalk = require('chalk');

const gradle = require('gradle');
const git = require('simple-git/promise');
const npm = require('global-npm');
const rally = require('rally'), restApi = rally({
    apiKey: ''
});
const {Docker} = require('docker-cli-js');
const {filesystem} = require('gluegun/filesystem');
const homeDir = filesystem.homedir();
const repos = {
    'Client1': 'https://github.com/philip-pannenko/client1.git',
    'Client-Utils': 'https://github.com/philip-pannenko/client-utils.git',
    'Server1': 'https://github.com/philip-pannenko/server1.git',
    'Server-Utils': 'https://github.com/philip-pannenko/server-utils.git',
    'Cloud-Config': ''
};

const repoPorts = {
    'Client1': 80,
    'Server1': 8080,
    'Cloud-Config': 8888
};

const docker_user = 'aistated';

const skipInquiry = true;

// const docker_password = credentials.docker_password;

async function checkoutRepository(answers) {
    for (let component of answers.components) {
        try {
            let projectDir = answers.workDirectory + "/" + component.toLowerCase();
            let componentRepo = repos[component];
            if (!fs.existsSync(projectDir)) {
                await git(answers.workDirectory).clone(componentRepo);
            }
        } catch (err) {
            console.error(component + ' FAILED');
            console.error(err);
        }

    }
}

async function preparingBranches(answers) {

    for (let component of answers.components) {
        try {
            let projectDir = answers.workDirectory + "/" + component.toLowerCase();
            let isRepo = await git(projectDir).checkIsRepo();
            if (isRepo) {
                await git(projectDir).fetch();
                let status = await git(projectDir).status();

                if (status.current !== answers.storyName) {

                    await git(projectDir).stash();
                    await git(projectDir).clean('f');
                    let branches = await git(projectDir).branch();

                    // If the branch exists, check it out otherwise create it first before checking it out
                    if (branches.all.includes(answers.storyName)) {
                        await git(projectDir).checkout(answers.storyName);
                    } else {
                        await git(projectDir).checkout(['-b', answers.storyName]);
                    }

                }

            } else {
                console.error("A non repository directory of the same name already exists here!");
            }
        } catch (err) {
            console.error(component + ' FAILED');
            console.error(err);
        }
    }

}

async function buildingCodebase(answers) {
    for (let component of answers.components) {
        try {
            let projectDir = answers.workDirectory + "/" + component.toLowerCase();
            if (fs.existsSync(projectDir + '/package.json')) {
                npm.load({loglevel:'silent'}, async () => {
                    await npm.commands.install(projectDir, [])
                })
                npm.on("log", () => {
                   debugger;
                });
            } else if (fs.existsSync(projectDir + '/build.gradle')) {

                await gradle({cwd: projectDir, args: ['build']})
            } else {
                console.error("No build script found!");
            }
        } catch (err) {
            console.error(component + ' FAILED');
            console.error(err);
        }
    }
}

async function prepareLocalEnvironment(answers) {

    let docker = new Docker();

    // Get the repos NOT associated with the branch being built locally
    let requiredDockerImages = Object.keys(repoPorts).filter(repoPort => !answers.components.includes(repoPort));

    // for (let requiredDockerImage of requiredDockerImages) {
    try {
        //let port = requiredDockerImages[requiredDockerImage];
        //let dockerImageName = '@' + docker_user + requiredDockerImage;

        let port = '80:80';
        let dockerImageName = 'nginx';

        let result = await docker.command('run -d -p ' + port + ' ' + dockerImageName);
        // result = await docker.command('port ' + result.containerId);
        // let port = result.split(':')[1];


    } catch (err) {
        console.error(requiredDockerImage + ' FAILED');
        console.error(err);
    }
    // }

}

async function performInquiries() {

    // CLI like inquiries
    CFonts.say('CICD - Toolkit!', {
        font: 'block',              // define the font face
        align: 'left',              // define text alignment
        colors: ['system'],         // define all colors
        background: 'transparent',  // define the background color, you can also use `backgroundColor` here as key
        letterSpacing: 1,           // define letter spacing
        lineHeight: 1,              // define the line height
        space: true,                // define if the output text should have empty lines on top and on the bottom
        maxLength: '0',             // define how many character can be on one line
    });

    let answers = {};

    let results = await inquirer.prompt([
        {
            type: 'list',
            name: 'activity',
            message: 'What would you like to do?',
            choices: [
                {value: 'INIT', name: 'Initialize your environment to best use this toolkit'},
                {value: 'VERIFY_STORY', name: 'Double check a story status'},
                {value: 'CREATE', name: 'Begin and/or continue working a story'},
                {value: 'PUBLISH_ENV', name: 'Publish work to remote environment'},
                {value: 'STAGE', name: 'Stage work for production'}
            ]
        }]);

    Object.assign(answers, results);

    if (answers.activity === 'CREATE') {

        while (!answers.storyConfirmed) {

            results = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'storyName',
                    message: 'Name of story?',

                }]);

            Object.assign(answers, results);

            results = await verifyRallyStory(answers);

            console.log(chalk.blue.bold(JSON.stringify(results, null, '  ')));

            results = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'storyConfirmed',
                    message: 'Does the Rally story information look accurate? By typing (n) you will get a chance to re-enter the story name'
                }
            ]);

            Object.assign(answers, results);

        }


        results = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'components',
                message: 'Which components will you need?',
                choices: Object.keys(repos)
            }, {
                type: 'input',
                name: 'workDirectory',
                message: 'Name of working directory?',
                default: homeDir + '/CICD-Projects'
            }
        ]);

        Object.assign(answers, results);


    } else {
        console.log(chalk.red('Not implemented yet'));
    }

    console.log(chalk.blue.bold(JSON.stringify(answers, null, '  ')));

    results = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmed',
            message: 'Does the above look good?'
        }
    ]);

    Object.assign(answers, results);


    return answers


}

async function createWorkingDirectory(answers) {
    if (!fs.existsSync(answers.workDirectory)) {
        fs.mkdirSync(answers.workDirectory);
    }
}

async function verifyRallyStory(answers) {

    let result = {
        story: answers.storyName,
        owner: "N/A",
        scheduledState: "N/A",

    };

    let queryUtils = rally.util.query;

    let type;

    if (answers.storyName.startsWith('US')) {
        type = 'requirement';
    } else if (answers.storyName.startsWith('DE')) {
        type = 'defect';
    } else {
        console.log('Story type (' + answers.storyName + ') not supported');
        return result;
    }

    let data = await restApi.query({
        type: type,
        limit: 1,
        fetch: ['Owner', 'FormattedID', 'Name', 'ScheduleState'],
        query: queryUtils.where('FormattedID', '=', answers.storyName)
    });

    if (data.Results.length) {
        if (!isEmpty(data.Results[0]) && !isEmpty(data.Results[0].Owner) && !isEmpty(data.Results[0].Owner._refObjectName)) {
            result.owner = data.Results[0].Owner._refObjectName;
        }
        if (!isEmpty(data.Results[0]) && !isEmpty(data.Results[0].ScheduleState)) {
            result.scheduledState = data.Results[0].ScheduleState;
        }
    }
    return result;
}

async function app() {

    try {

        let answers = !skipInquiry ?
            await performInquiries() :
            {
                "activity": "CREATE",
                "storyName": "US146455",
                "components": [
                    "Client1",
                    "Client-Utils",
                    "Server-Utils",
                    "Server1"
                ],
                "confirmed": true,
                "workDirectory": homeDir + "/CICD-Projects"
            };

        if (answers.confirmed) {

            if (answers.activity === 'CREATE') {

                console.log(chalk.green.bold('Preparing working directory.'));
                await createWorkingDirectory(answers);

                console.log(chalk.green.bold('Checking out repository(ies).'));
                await checkoutRepository(answers);

                console.log(chalk.green.bold('Preparing branch(es).'));
                await preparingBranches(answers);

                console.log(chalk.green.bold('Building project(s).'));
                await buildingCodebase(answers);
            }

            // console.log(chalk.green.bold('Preparing local environment. Done!'));
            // await prepareLocalEnvironment(answers);
            // console.log(chalk.green.bold('Preparing remote environment. Done!'));


        }

    } catch (err) {
        console.error(err);
    }
}

app();

function isEmpty(value) {
    return value === undefined || value === null;
}


