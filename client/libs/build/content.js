const path          = require('path');
const _             = require('lodash');
const fs            = require('fs');
const frontMatter   = require('front-matter');
const ejs           = require('ejs');

const marked          = require('./markdown');
const templates       = require('./templates');
const applyProduction = require('./production');
const file            = require('./file');

const ignoreFiles     = ['.DS_Store'];

// -----------------------------------------------------------------------------
// build a single file
// -----------------------------------------------------------------------------
function buildContent(fullPath, templateDirs, webpackAssets, stage, options) {
  const content     = fs.readFileSync(fullPath, 'utf8');
  const parsed      = frontMatter(content);
  const metadata    = parsed.attributes;
  const title       = metadata.title;
  const destination = metadata.permalink;
  const data        = _.merge({
    _,
    title,
    metadata,
    url: destination
  }, options.templateData);

  let html = parsed.body;

  // Parse any markdown in the resulting html
  html = marked(html);

  try {
    // Allow ejs code in content
    html = ejs.compile(html, {
      cache    : false,
      filename : fullPath
    })(data);
  } catch (err) {
    console.log(`Unable to compile html from ${fullPath}`);
    console.log(err);
    console.log('Call stack');
    console.log(err.stack);
  }

  // Apply template
  data.content = html; // Pass in generated html
  html = templates.apply(data, fullPath, options.templateMap, templateDirs);
  html = applyProduction(html, stage, webpackAssets, options.buildSuffix);

  return {
    title,
    metadata,
    destination,
    html,
    source : fullPath,
    url    : destination
  };

}

// -----------------------------------------------------------------------------
// build html and markdown files in a given directory
// -----------------------------------------------------------------------------
function buildContents(inputPath, outputPath, webpackAssets, stage, options) {
  let results = [];
  const files = fs.readdirSync(inputPath);
  const templateDirs = _.map(options.templateDirs,
    templateDir => path.join(inputPath, templateDir)
  );

  files.forEach((fileName) => {
    const fullInputPath = path.join(inputPath, fileName);
    const doOutput = templateDirs.indexOf(fullInputPath) < 0 && // Ignore template dirs
                  !_.includes(ignoreFiles, fileName);
    if (doOutput) {
      if (fs.statSync(fullInputPath).isDirectory()) {
        results = _.concat(results, buildContents(
          fullInputPath,
          outputPath,
          webpackAssets,
          stage,
          options
        ));
      } else {
        const ext = path.extname(fullInputPath);
        if (_.includes(options.buildExtensions, ext)) {
          const page = buildContent(fullInputPath, templateDirs, webpackAssets, stage, options);
          let outFile = fileName;
          let outPath = outputPath;
          let inPath = inputPath;
          if (page.destination && page.destination.length > 0) {
            if (_.endsWith(page.destination, '/')) {
              outPath = path.join(outPath, page.destination);
              outFile = 'index.html';
            } else {
              outFile = page.destination;
            }
            inPath = '';
          }
          page.outputFilePath = file.write(inPath, outPath, outFile, page.html, options);
          results.push(page);
        } else {
          file.copy(inputPath, outputPath, fileName, options);
        }
      }
    }
  });
  return results;
}

module.exports = {
  buildContent,
  buildContents
};
