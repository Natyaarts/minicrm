import json

def search_json(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    urls = []
    
    def traverse(obj):
        if isinstance(obj, dict):
            if 'request' in obj:
                req = obj['request']
                if 'url' in req:
                    url = req['url']
                    url_str = ""
                    if isinstance(url, dict):
                        url_str = '/'.join(url.get('path', []))
                    elif isinstance(url, str):
                        url_str = url
                        
                    print(f"Name: {obj.get('name')}")
                    print(f"URL: {url_str}")
                    
                    if 'response' in obj and len(obj['response']) > 0:
                        body = obj['response'][0].get('body', '')
                        if body:
                            try:
                                print(json.dumps(json.loads(body), indent=2)[:300])
                            except:
                                print("Body not JSON")
                    print("-" * 40)
            for v in obj.values():
                traverse(v)
        elif isinstance(obj, list):
            for i in obj:
                traverse(i)
                
    traverse(data)

search_json('wise_collection.json')
