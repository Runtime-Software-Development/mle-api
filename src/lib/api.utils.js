/*!
 * MLP.API.Utilities.API
 * File: api.utils.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Package JSON data for HTTP response.
 *
 * @src public
 * @param {Object} model
 * @param view
 * @param message
 * @param user
 * @param data
 * @param path
 * @param dependent
 * @param filter
 */

export function prepare({
                            model={},
                            view='',
                            message={},
                            user=null,
                            data=null,
                            path={},
                            filter = []
}) {

    // get model attributes
    const { name='', attributes={} } = model;

    // get submission data
    const submissionData = data
        ? data
        : Object.keys(model).length > 0 ? model.getData(filter) : {};

    return {
        model: {
            name: name,
            attributes: attributes
        },
        path: path,
        view: view,
        message: message,
        data: submissionData,
        user: user
    }
}


  /**
   * Recursively convert a JS object to a FormData object.
   * This is useful for sending complex data to a server.
   * @param {Object} obj - The JS object to convert.
   * @param {String} [prefix=''] - The prefix to add to the key names.
   * @return {FormData} The converted FormData object.
   */
  export function objectToFormData(obj, prefix = '') {
    const formData = new FormData();
    Object.keys(obj).forEach(key => {
      const propName = prefix ? `${prefix}[${key}]` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        // If the value is an object, recursively call this function
        // and append the resulting FormData object to the parent object
        objectToFormData(obj[key], propName).forEach((value, subKey) => {
          formData.append(`${subKey}`, value);
        });
      } else {
        // If the value is not an object, simply append it to the FormData
        formData.append(propName, obj[key]);
      }
    });
    return formData;
  }
  
  