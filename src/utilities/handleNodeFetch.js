export const handleNodeFetch = async (main, finalUrl, options) => {

    let nodeFetch

    if(typeof fetch === 'function')
    {
      nodeFetch = fetch
    }
    else {
        if(typeof main.nodeFetch === 'function')
        {
          nodeFetch = main.nodeFetch
        }
        else
        {
          throw new Error('"fetch" library is not available in your global scope. you can pass "fetch" using the property "nodeFetch" in your strategy')
        }
    }


    // Make the request
    const response = await nodeFetch(finalUrl, options);

    // Handle response
    const statusCode = response.status;
    const responseText = await response.text();

    if (statusCode === 200) {
        return JSON.parse(responseText);
    }

    throw new Error(`Request failed with status ${statusCode}: ${responseText}`);
}