module.exports = function (grunt) {

    grunt.loadNpmTasks("grunt-contrib-jshint");

    grunt.initConfig({

        jshint: {
            files: ["./src/**/*.js"],
            options: {
                jshintrc: ".jshintrc"
            }
        }

    });

    grunt.registerTask("default", ["jshint"]);
};